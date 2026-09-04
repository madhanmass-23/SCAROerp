import { supabase } from '../lib/supabase';
import type { NotificationItem } from '../types/notification';

/**
 * Shared Notification Service
 * Encapsulates all query and state update operations for notifications.
 * RLS enforces that users can only select, update, and delete their own notifications.
 */

export async function fetchUserNotifications(userId: string, limit = 50): Promise<NotificationItem[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data || []) as NotificationItem[];
}

export async function fetchUnreadCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false);

  if (error) throw error;
  return count || 0;
}

export async function markNotificationAsRead(id: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', id);

  if (error) throw error;
}

export async function markAllNotificationsAsRead(userId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false);

  if (error) throw error;
}

export async function deleteNotification(id: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

/**
 * Checks whether the current user is an active Employee/Intern who is checked in today,
 * has not submitted their daily report, and is not on approved leave.
 * If so, generates a single idempotent report pending reminder.
 */
export async function triggerDailyReportReminder(): Promise<void> {
  try {
    await supabase.rpc('check_daily_report_reminder');
  } catch (err) {
    console.error('Failed to trigger daily report reminder:', err);
  }
}

/**
 * Maps a notification to its destination route in SCARO ERP.
 * Ensures structured navigation with deep linking.
 */
export function getNotificationDestination(n: NotificationItem): string {
  const refType = n.reference_type?.toLowerCase();
  const type = n.type?.toLowerCase();

  if (refType === 'task' || type.startsWith('task')) {
    return n.reference_id ? `/app/tasks?taskId=${n.reference_id}` : '/app/tasks';
  }

  if (refType === 'message' || type === 'direct_message') {
    return n.reference_id ? `/app/messages?userId=${n.reference_id}` : '/app/messages';
  }

  if (refType === 'meeting' || type.startsWith('meeting')) {
    return n.reference_id ? `/app/meetings?meetingId=${n.reference_id}` : '/app/meetings';
  }

  if (refType === 'daily_report' || type.startsWith('report')) {
    if (type === 'report_submitted' && n.reference_id) {
      return `/app/reports?reportId=${n.reference_id}`;
    }
    return '/app/tracker';
  }

  if (refType === 'leave' || type.startsWith('leave')) {
    return '/app/leave';
  }

  if (refType === 'announcement' || type === 'announcement') {
    return '/app/dashboard';
  }

  return '/app/dashboard';
}
