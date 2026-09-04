export type ProjectStatus = 'Active' | 'On Hold' | 'Completed' | 'Archived';

export interface Project {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus | string;
  start_date: string | null;
  end_date: string | null;
  owner_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  owner?: {
    full_name: string;
    email?: string;
  } | null;
  member_count?: number;
  total_tasks_count?: number;
  completed_tasks_count?: number;
  overdue_tasks_count?: number;
  progress?: number;
}

export interface ProjectMember {
  project_id: string;
  user_id: string;
  created_at: string;
  user?: {
    id: string;
    full_name: string;
    email: string;
    avatar_url?: string | null;
    employment_status?: string;
  } | null;
}

export interface CreateProjectPayload {
  name: string;
  description?: string | null;
  status?: ProjectStatus | string;
  start_date?: string | null;
  end_date?: string | null;
  owner_id?: string | null;
}

export interface UpdateProjectPayload {
  name?: string;
  description?: string | null;
  status?: ProjectStatus | string;
  start_date?: string | null;
  end_date?: string | null;
  owner_id?: string | null;
}
