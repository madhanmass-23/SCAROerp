export type TaskStatus = 
  | 'Todo' 
  | 'In Progress' 
  | 'Review' 
  | 'Needs Revision' 
  | 'Completed' 
  | 'On Hold' 
  | 'Cancelled';

export type TaskPriority = 'Low' | 'Medium' | 'High' | 'Urgent';

export interface Task {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  assignee_id: string | null;
  reporter_id: string;
  priority: TaskPriority;
  status: TaskStatus;
  progress: number;
  estimated_hours: number;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  project?: {
    id: string;
    name: string;
    status: string;
  } | null;
  assignee?: {
    id: string;
    full_name: string;
    email?: string;
  } | null;
  reporter?: {
    id: string;
    full_name: string;
    email?: string;
  } | null;
  comments_count?: number;
  attachments_count?: number;
  is_overdue?: boolean;
  is_due_today?: boolean;
}

export interface TaskComment {
  id: string;
  task_id: string;
  author_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  author?: {
    id: string;
    full_name: string;
    avatar_url?: string | null;
  } | null;
}

export interface TaskAttachment {
  id: string;
  task_id: string;
  uploaded_by: string;
  file_name: string;
  storage_path: string;
  file_size: number;
  file_type: string | null;
  created_at: string;
  uploader?: {
    id: string;
    full_name: string;
  } | null;
}

export interface CreateTaskPayload {
  project_id: string;
  title: string;
  description?: string | null;
  assignee_id?: string | null;
  priority?: TaskPriority;
  status?: TaskStatus;
  progress?: number;
  estimated_hours?: number;
  due_date?: string | null;
}

export interface UpdateTaskPayload {
  title?: string;
  description?: string | null;
  assignee_id?: string | null;
  priority?: TaskPriority;
  status?: TaskStatus;
  progress?: number;
  estimated_hours?: number;
  due_date?: string | null;
}

export interface TaskFilterParams {
  tab?: 'my_tasks' | 'assigned_by_me' | 'assigned_by_manager' | 'all_tasks';
  projectId?: string;
  status?: TaskStatus | 'All';
  priority?: TaskPriority | 'All';
  assigneeId?: string;
  isOverdue?: boolean;
  isDueToday?: boolean;
  dateFilter?: 'All' | 'Due Today' | 'Overdue' | 'Upcoming';
  searchQuery?: string;
}

export interface AssignableUser {
  id: string;
  full_name: string;
  email: string;
  avatar_url?: string | null;
  role: 'Employee' | 'Intern';
  department_name?: string | null;
  designation?: string | null;
}
