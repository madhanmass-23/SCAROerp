import { supabase } from '../lib/supabase';
import type { Project, ProjectMember, CreateProjectPayload, UpdateProjectPayload } from '../types/project';

/**
 * Project Service - Centralized API layer for SCARO ERP Projects
 */

export async function fetchProjects(statusFilter?: string): Promise<Project[]> {
  // 1. Fetch base projects with owner profile
  let query = supabase
    .from('projects')
    .select(`
      id,
      name,
      description,
      status,
      start_date,
      end_date,
      owner_id,
      created_by,
      created_at,
      updated_at,
      owner:profiles!projects_owner_id_fkey(full_name, email)
    `)
    .order('created_at', { ascending: false });

  if (statusFilter && statusFilter !== 'All') {
    query = query.eq('status', statusFilter);
  }

  const { data: projectsData, error: projectsErr } = await query;
  if (projectsErr) throw projectsErr;

  if (!projectsData || projectsData.length === 0) {
    return [];
  }

  const projectIds = projectsData.map((p) => p.id);

  // 2. Fetch task aggregates for derived progress & overdue metrics
  const { data: tasksData, error: tasksErr } = await supabase
    .from('tasks')
    .select('id, project_id, status, progress, due_date')
    .in('project_id', projectIds);

  if (tasksErr) {
    console.warn('Could not fetch task counts for projects:', tasksErr.message);
  }

  // 3. Fetch member counts
  const { data: membersData, error: membersErr } = await supabase
    .from('project_members')
    .select('project_id, user_id')
    .in('project_id', projectIds);

  if (membersErr) {
    console.warn('Could not fetch member counts for projects:', membersErr.message);
  }

  const todayStr = new Date().toISOString().split('T')[0];

  // 4. Combine and compute derived metrics
  const enrichedProjects: Project[] = projectsData.map((proj: any) => {
    const projTasks = (tasksData || []).filter((t: any) => t.project_id === proj.id);
    const nonCancelledTasks = projTasks.filter((t: any) => t.status !== 'Cancelled');
    const totalCount = nonCancelledTasks.length;
    const completedCount = nonCancelledTasks.filter((t: any) => t.status === 'Completed').length;
    
    // Overdue: due_date < today AND status not in Completed, Cancelled
    const overdueCount = nonCancelledTasks.filter((t: any) => {
      return t.due_date && t.due_date < todayStr && t.status !== 'Completed';
    }).length;

    // Derived progress formula: completed / total non-cancelled tasks
    const derivedProgress = totalCount > 0 
      ? Math.round((completedCount / totalCount) * 100) 
      : 0;

    const memberCount = (membersData || []).filter((m: any) => m.project_id === proj.id).length;

    return {
      ...proj,
      total_tasks_count: totalCount,
      completed_tasks_count: completedCount,
      overdue_tasks_count: overdueCount,
      progress: derivedProgress,
      member_count: memberCount
    };
  });

  return enrichedProjects;
}

export async function fetchProjectById(id: string): Promise<Project | null> {
  const { data, error } = await supabase
    .from('projects')
    .select(`
      id,
      name,
      description,
      status,
      start_date,
      end_date,
      owner_id,
      created_by,
      created_at,
      updated_at,
      owner:profiles!projects_owner_id_fkey(full_name, email)
    `)
    .eq('id', id)
    .single();

  if (error) throw error;
  return data as unknown as Project;
}

export async function fetchProjectMembers(projectId: string): Promise<ProjectMember[]> {
  const { data, error } = await supabase
    .from('project_members')
    .select(`
      project_id,
      user_id,
      created_at,
      user:profiles!project_members_user_id_fkey(id, full_name, email, avatar_url, employment_status)
    `)
    .eq('project_id', projectId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data || []) as unknown as ProjectMember[];
}

export async function createProject(payload: CreateProjectPayload): Promise<Project> {
  const { data: sessionData } = await supabase.auth.getSession();
  const currentUserId = sessionData?.session?.user?.id;
  if (!currentUserId) throw new Error('User not authenticated');

  const { data, error } = await supabase
    .from('projects')
    .insert({
      name: payload.name.trim(),
      description: payload.description?.trim() || null,
      status: payload.status || 'Active',
      start_date: payload.start_date || null,
      end_date: payload.end_date || null,
      owner_id: payload.owner_id || currentUserId,
      created_by: currentUserId
    })
    .select(`
      *,
      owner:profiles!projects_owner_id_fkey(full_name, email)
    `)
    .single();

  if (error) throw error;

  // Auto-enroll creator as project member if not already
  try {
    await supabase.from('project_members').insert({
      project_id: data.id,
      user_id: currentUserId
    });
  } catch (enrollErr) {
    console.warn('Auto-enroll error:', enrollErr);
  }

  return data as unknown as Project;
}

export async function updateProject(id: string, payload: UpdateProjectPayload): Promise<Project> {
  const updates: Record<string, any> = {};
  if (payload.name !== undefined) updates.name = payload.name.trim();
  if (payload.description !== undefined) updates.description = payload.description?.trim() || null;
  if (payload.status !== undefined) updates.status = payload.status;
  if (payload.start_date !== undefined) updates.start_date = payload.start_date || null;
  if (payload.end_date !== undefined) updates.end_date = payload.end_date || null;
  if (payload.owner_id !== undefined) updates.owner_id = payload.owner_id || null;

  const { data, error } = await supabase
    .from('projects')
    .update(updates)
    .eq('id', id)
    .select(`
      *,
      owner:profiles!projects_owner_id_fkey(full_name, email)
    `)
    .single();

  if (error) throw error;
  return data as unknown as Project;
}

export async function addProjectMember(projectId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('project_members')
    .insert({
      project_id: projectId,
      user_id: userId
    });

  if (error && error.code !== '23505') throw error;
}

export async function removeProjectMember(projectId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('project_members')
    .delete()
    .eq('project_id', projectId)
    .eq('user_id', userId);

  if (error) throw error;
}

export async function fetchCandidateProfiles(): Promise<Array<{ id: string; full_name: string; email: string; employment_status: string }>> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, employment_status')
    .order('full_name', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function fetchProjectActivity(projectId: string) {
  // 1. Fetch active tasks for this project
  const { data: tasksData } = await supabase
    .from('tasks')
    .select(`
      id,
      title,
      status,
      priority,
      progress,
      assignee:profiles!tasks_assignee_id_fkey(full_name)
    `)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(10);

  // 2. Fetch recent daily report tasks linked to this project
  const { data: reportTasksData } = await supabase
    .from('daily_report_tasks')
    .select(`
      id,
      time_spent_minutes,
      completion_percentage,
      task_status,
      tasks!inner (
        id,
        title,
        project_id
      ),
      daily_reports!inner (
        report_date,
        profiles!daily_reports_user_id_fkey (
          full_name
        )
      )
    `)
    .eq('tasks.project_id', projectId)
    .order('daily_reports(report_date)', { ascending: false })
    .limit(10);

  return {
    tasks: tasksData || [],
    recentReportActivity: reportTasksData || []
  };
}
