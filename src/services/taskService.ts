import { supabase } from '../lib/supabase';
import type { 
  Task, 
  TaskComment, 
  TaskAttachment, 
  CreateTaskPayload, 
  UpdateTaskPayload, 
  TaskFilterParams,
  AssignableUser
} from '../types/task';

/**
 * Task Service - Centralized API layer for SCARO ERP Tasks
 */

export async function fetchAssignableUsers(): Promise<AssignableUser[]> {
  const [
    { data: profilesData, error: profilesErr },
    { data: userRolesData, error: rolesErr },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, email, avatar_url, designation, is_active, department:departments!profiles_department_id_fkey(name)')
      .eq('is_active', true),
    supabase
      .from('user_roles')
      .select('user_id, roles ( name )'),
  ]);

  if (profilesErr) throw profilesErr;
  if (rolesErr) throw rolesErr;

  const userRolesMap = new Map<string, string>();
  userRolesData?.forEach((ur: any) => {
    const roleName = Array.isArray(ur.roles) ? ur.roles[0]?.name : ur.roles?.name;
    if (roleName) {
      userRolesMap.set(ur.user_id, roleName);
    }
  });

  const assignable: AssignableUser[] = [];
  profilesData?.forEach((p: any) => {
    const role = userRolesMap.get(p.id);
    if (role === 'Employee' || role === 'Intern') {
      assignable.push({
        id: p.id,
        full_name: p.full_name || p.email.split('@')[0],
        email: p.email,
        avatar_url: p.avatar_url,
        role: role as 'Employee' | 'Intern',
        department_name: (p.department as any)?.name || null,
        designation: p.designation || null,
      });
    }
  });

  // Sort: Employees first, then Interns; alphabetically by name
  return assignable.sort((a, b) => {
    if (a.role !== b.role) return a.role === 'Employee' ? -1 : 1;
    return a.full_name.localeCompare(b.full_name);
  });
}

export async function fetchTasks(params: TaskFilterParams = {}): Promise<Task[]> {
  const { data: sessionData } = await supabase.auth.getSession();
  const currentUserId = sessionData?.session?.user?.id;
  if (!currentUserId) throw new Error('User not authenticated');

  let query = supabase
    .from('tasks')
    .select(`
      id,
      project_id,
      title,
      description,
      assignee_id,
      reporter_id,
      priority,
      status,
      progress,
      estimated_hours,
      due_date,
      created_at,
      updated_at,
      project:projects!tasks_project_id_fkey(id, name, status),
      assignee:profiles!tasks_assignee_id_fkey(id, full_name, email),
      reporter:profiles!tasks_reporter_id_fkey(id, full_name, email)
    `)
    .order('created_at', { ascending: false });

  // 1. Apply Tab Filter
  if (params.tab === 'assigned_by_me') {
    query = query
      .eq('reporter_id', currentUserId)
      .neq('assignee_id', currentUserId);
  } else if (params.tab === 'assigned_by_manager') {
    query = query
      .eq('assignee_id', currentUserId)
      .neq('reporter_id', currentUserId);
  } else if (params.tab === 'my_tasks') {
    query = query.eq('assignee_id', currentUserId);
  }
  // 'all_tasks' relies on RLS (Admin/Super Admin will see all, others see project-authorized)

  // 2. Project Filter
  if (params.projectId && params.projectId !== 'All') {
    query = query.eq('project_id', params.projectId);
  }

  // 3. Status Filter (Strictly using actual enum values)
  if (params.status && params.status !== 'All') {
    query = query.eq('status', params.status);
  }

  // 4. Priority Filter
  if (params.priority && params.priority !== 'All') {
    query = query.eq('priority', params.priority);
  }

  // 5. Assignee Filter
  if (params.assigneeId && params.assigneeId !== 'All') {
    query = query.eq('assignee_id', params.assigneeId);
  }

  const { data, error } = await query;
  if (error) throw error;

  const todayStr = new Date().toISOString().split('T')[0];

  // 6. Post-process & Overdue derivation
  let tasks: Task[] = (data || []).map((row: any) => {
    const isOverdue = !!(row.due_date && row.due_date < todayStr && row.status !== 'Completed' && row.status !== 'Cancelled');
    return {
      ...row,
      is_overdue: isOverdue
    };
  });

  // 7. Apply In-Memory / Client filters (Overdue toggle, Search keyword)
  if (params.isOverdue) {
    tasks = tasks.filter((t) => t.is_overdue);
  }

  if (params.searchQuery && params.searchQuery.trim()) {
    const q = params.searchQuery.toLowerCase().trim();
    tasks = tasks.filter(
      (t) => t.title.toLowerCase().includes(q) || (t.description && t.description.toLowerCase().includes(q))
    );
  }

  return tasks;
}

export async function fetchTaskById(id: string): Promise<Task | null> {
  const { data, error } = await supabase
    .from('tasks')
    .select(`
      id,
      project_id,
      title,
      description,
      assignee_id,
      reporter_id,
      priority,
      status,
      progress,
      estimated_hours,
      due_date,
      created_at,
      updated_at,
      project:projects!tasks_project_id_fkey(id, name, status),
      assignee:profiles!tasks_assignee_id_fkey(id, full_name, email),
      reporter:profiles!tasks_reporter_id_fkey(id, full_name, email)
    `)
    .eq('id', id)
    .single();

  if (error) throw error;
  if (!data) return null;

  const todayStr = new Date().toISOString().split('T')[0];
  const isOverdue = !!(data.due_date && data.due_date < todayStr && data.status !== 'Completed' && data.status !== 'Cancelled');

  return {
    ...data,
    is_overdue: isOverdue
  } as unknown as Task;
}

export async function createTask(payload: CreateTaskPayload): Promise<Task> {
  const { data: sessionData } = await supabase.auth.getSession();
  const currentUserId = sessionData?.session?.user?.id;
  if (!currentUserId) throw new Error('User not authenticated');

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      project_id: payload.project_id,
      title: payload.title.trim(),
      description: payload.description?.trim() || null,
      assignee_id: payload.assignee_id || currentUserId,
      reporter_id: currentUserId,
      priority: payload.priority || 'Medium',
      status: payload.status || 'Todo',
      progress: payload.progress || 0,
      estimated_hours: payload.estimated_hours || 0,
      due_date: payload.due_date ? payload.due_date : null
    })
    .select()
    .single();

  if (error) {
    console.error('createTask database error:', error);
    throw error;
  }
  return data as unknown as Task;
}

export async function updateTask(id: string, payload: UpdateTaskPayload): Promise<Task> {
  const updates: Record<string, any> = {};
  if (payload.title !== undefined) updates.title = payload.title.trim();
  if (payload.description !== undefined) updates.description = payload.description?.trim() || null;
  if (payload.assignee_id !== undefined) updates.assignee_id = payload.assignee_id || null;
  if (payload.priority !== undefined) updates.priority = payload.priority;
  if (payload.status !== undefined) updates.status = payload.status;
  if (payload.progress !== undefined) updates.progress = payload.progress;
  if (payload.estimated_hours !== undefined) updates.estimated_hours = payload.estimated_hours;
  if (payload.due_date !== undefined) updates.due_date = payload.due_date ? payload.due_date : null;

  const { data, error } = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('updateTask database error:', error);
    throw error;
  }
  return data as unknown as Task;
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

// ============================================================================
// Comments
// ============================================================================

export async function fetchTaskComments(taskId: string): Promise<TaskComment[]> {
  const { data, error } = await supabase
    .from('task_comments')
    .select(`
      id,
      task_id,
      author_id,
      content,
      created_at,
      updated_at,
      author:profiles!task_comments_author_id_fkey(id, full_name, avatar_url)
    `)
    .eq('task_id', taskId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data || []) as unknown as TaskComment[];
}

export async function addTaskComment(taskId: string, content: string): Promise<TaskComment> {
  const { data: sessionData } = await supabase.auth.getSession();
  const currentUserId = sessionData?.session?.user?.id;
  if (!currentUserId) throw new Error('User not authenticated');

  const { data, error } = await supabase
    .from('task_comments')
    .insert({
      task_id: taskId,
      author_id: currentUserId,
      content: content.trim()
    })
    .select(`
      *,
      author:profiles!task_comments_author_id_fkey(id, full_name, avatar_url)
    `)
    .single();

  if (error) throw error;
  return data as unknown as TaskComment;
}

// ============================================================================
// Attachments
// ============================================================================

export async function fetchTaskAttachments(taskId: string): Promise<TaskAttachment[]> {
  const { data, error } = await supabase
    .from('task_attachments')
    .select(`
      id,
      task_id,
      uploaded_by,
      file_name,
      storage_path,
      file_size,
      file_type,
      created_at,
      uploader:profiles!task_attachments_uploaded_by_fkey(id, full_name)
    `)
    .eq('task_id', taskId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as unknown as TaskAttachment[];
}

export async function uploadTaskAttachment(taskId: string, file: File): Promise<TaskAttachment> {
  const { data: sessionData } = await supabase.auth.getSession();
  const currentUserId = sessionData?.session?.user?.id;
  if (!currentUserId) throw new Error('User not authenticated');

  // Sanitize filename and create folder structure: {taskId}/{timestamp}_{filename}
  const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${taskId}/${Date.now()}_${sanitizedName}`;

  // 1. Upload to storage bucket
  const { error: storageErr } = await supabase.storage
    .from('task-attachments')
    .upload(storagePath, file, {
      cacheControl: '3600',
      upsert: false
    });

  if (storageErr) throw storageErr;

  // 2. Insert record in task_attachments table
  const { data, error: dbErr } = await supabase
    .from('task_attachments')
    .insert({
      task_id: taskId,
      uploaded_by: currentUserId,
      file_name: file.name,
      storage_path: storagePath,
      file_size: file.size,
      file_type: file.type || 'application/octet-stream'
    })
    .select(`
      *,
      uploader:profiles!task_attachments_uploaded_by_fkey(id, full_name)
    `)
    .single();

  if (dbErr) {
    // Attempt rollback storage object
    await supabase.storage.from('task-attachments').remove([storagePath]);
    throw dbErr;
  }

  return data as unknown as TaskAttachment;
}

export async function getAttachmentSignedUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('task-attachments')
    .createSignedUrl(storagePath, 900); // 15 minute TTL

  if (error) throw error;
  return data.signedUrl;
}

export async function deleteTaskAttachment(attachmentId: string, storagePath: string): Promise<void> {
  // 1. Delete from database
  const { error: dbErr } = await supabase
    .from('task_attachments')
    .delete()
    .eq('id', attachmentId);

  if (dbErr) throw dbErr;

  // 2. Delete from storage bucket
  const { error: storageErr } = await supabase.storage
    .from('task-attachments')
    .remove([storagePath]);

  if (storageErr) {
    console.warn('Storage delete warning:', storageErr.message);
  }
}
