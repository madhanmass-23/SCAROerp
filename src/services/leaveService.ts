import { supabase } from '../lib/supabase';
import type {
  LeaveRequest,
  LeaveType,
  LeaveFilterParams,
  OverlapCheckResult,
} from '../types/leave';

/**
 * Leave & HR Operations Service
 * Centralizes all queries, mutations, status transitions, and overlap validations.
 * RLS and database triggers enforce all security boundaries.
 */

export async function fetchOwnLeaveRequests(userId: string): Promise<LeaveRequest[]> {
  const { data, error } = await supabase
    .from('leave_requests')
    .select(`
      id,
      user_id,
      type,
      start_date,
      end_date,
      reason,
      status,
      rejection_reason,
      reviewed_by,
      reviewed_at,
      created_at,
      updated_at
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as LeaveRequest[];
}

export async function fetchManagementLeaveRequests(
  params?: LeaveFilterParams
): Promise<LeaveRequest[]> {
  let query = supabase
    .from('leave_requests')
    .select(`
      id,
      user_id,
      type,
      start_date,
      end_date,
      reason,
      status,
      rejection_reason,
      reviewed_by,
      reviewed_at,
      created_at,
      updated_at,
      profiles!leave_requests_user_id_fkey(
        id,
        full_name,
        email,
        employment_status,
        department_id,
        departments!profiles_department_id_fkey(id, name)
      )
    `)
    .order('created_at', { ascending: false });

  if (params?.status && params.status !== 'All') {
    query = query.eq('status', params.status);
  }

  if (params?.type && params.type !== 'All') {
    query = query.eq('type', params.type);
  }

  if (params?.startDate) {
    query = query.gte('start_date', params.startDate);
  }

  if (params?.endDate) {
    query = query.lte('end_date', params.endDate);
  }

  const { data, error } = await query;
  if (error) throw error;

  let results: LeaveRequest[] = (data || []).map((row: any) => {
    const prof = row.profiles;
    const dept = prof?.departments;
    return {
      id: row.id,
      user_id: row.user_id,
      type: row.type,
      start_date: row.start_date,
      end_date: row.end_date,
      reason: row.reason,
      status: row.status,
      rejection_reason: row.rejection_reason,
      reviewed_by: row.reviewed_by,
      reviewed_at: row.reviewed_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
      applicant: prof
        ? {
            id: prof.id,
            full_name: prof.full_name,
            email: prof.email,
            employment_status: prof.employment_status,
            department_id: prof.department_id,
            department_name: dept?.name || null,
          }
        : undefined,
    };
  });

  // Client-side department and search filtering if requested
  if (params?.departmentId) {
    results = results.filter(r => r.applicant?.department_id === params.departmentId);
  }

  if (params?.searchQuery && params.searchQuery.trim() !== '') {
    const q = params.searchQuery.toLowerCase();
    results = results.filter(
      r =>
        r.applicant?.full_name?.toLowerCase().includes(q) ||
        r.applicant?.email?.toLowerCase().includes(q) ||
        r.reason?.toLowerCase().includes(q)
    );
  }

  return results;
}

export async function submitLeaveRequest(data: {
  user_id: string;
  type: LeaveType;
  start_date: string;
  end_date: string;
  reason: string;
}): Promise<LeaveRequest> {
  const { data: inserted, error } = await supabase
    .from('leave_requests')
    .insert({
      user_id: data.user_id,
      type: data.type,
      start_date: data.start_date,
      end_date: data.end_date,
      reason: data.reason,
    })
    .select()
    .single();

  if (error) throw error;
  return inserted as LeaveRequest;
}

export async function cancelLeaveRequest(id: string): Promise<void> {
  const { error } = await supabase
    .from('leave_requests')
    .update({ status: 'Cancelled' })
    .eq('id', id);

  if (error) throw error;
}

export async function approveLeaveRequest(id: string): Promise<void> {
  const { error } = await supabase
    .from('leave_requests')
    .update({ status: 'Approved' })
    .eq('id', id);

  if (error) throw error;
}

export async function rejectLeaveRequest(id: string, rejectionReason: string): Promise<void> {
  const reason = rejectionReason.trim() || 'Rejected by administrator';
  const { error } = await supabase
    .from('leave_requests')
    .update({
      status: 'Rejected',
      rejection_reason: reason,
    })
    .eq('id', id);

  if (error) throw error;
}

export async function checkLeaveOverlap(
  userId: string,
  startDate: string,
  endDate: string,
  excludeId?: string
): Promise<OverlapCheckResult> {
  let query = supabase
    .from('leave_requests')
    .select('id, user_id, type, start_date, end_date, reason, status, rejection_reason, reviewed_by, reviewed_at, created_at, updated_at')
    .eq('user_id', userId)
    .in('status', ['Pending', 'Approved'])
    .lte('start_date', endDate)
    .gte('end_date', startDate);

  if (excludeId) {
    query = query.neq('id', excludeId);
  }

  const { data, error } = await query;
  if (error) throw error;

  const overlapping = (data || []) as LeaveRequest[];
  return {
    hasOverlap: overlapping.length > 0,
    overlappingRequests: overlapping,
  };
}

export async function fetchTodayOnLeaveUsers(): Promise<
  { id: string; user_id: string; full_name: string; type: LeaveType; start_date: string; end_date: string }[]
> {
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('leave_requests')
    .select(`
      id,
      user_id,
      type,
      start_date,
      end_date,
      profiles!leave_requests_user_id_fkey(full_name)
    `)
    .eq('status', 'Approved')
    .lte('start_date', today)
    .gte('end_date', today);

  if (error) throw error;

  return (data || []).map((row: any) => ({
    id: row.id,
    user_id: row.user_id,
    full_name: row.profiles?.full_name || 'Team Member',
    type: row.type,
    start_date: row.start_date,
    end_date: row.end_date,
  }));
}

export async function fetchUpcomingApprovedLeaves(daysAhead = 30): Promise<LeaveRequest[]> {
  const today = new Date().toISOString().split('T')[0];
  const future = new Date(Date.now() + daysAhead * 86400000).toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('leave_requests')
    .select(`
      id,
      user_id,
      type,
      start_date,
      end_date,
      reason,
      status,
      rejection_reason,
      reviewed_by,
      reviewed_at,
      created_at,
      updated_at,
      profiles!leave_requests_user_id_fkey(full_name, employment_status, departments!profiles_department_id_fkey(name))
    `)
    .eq('status', 'Approved')
    .gte('start_date', today)
    .lte('start_date', future)
    .order('start_date', { ascending: true });

  if (error) throw error;

  return (data || []).map((row: any) => ({
    ...row,
    applicant: {
      id: row.user_id,
      full_name: row.profiles?.full_name || 'Team Member',
      email: '',
      employment_status: row.profiles?.employment_status || null,
      department_id: null,
      department_name: row.profiles?.departments?.name || null,
    },
  })) as LeaveRequest[];
}
