export type NotificationType =
  | 'task_assigned'
  | 'task_status_changed'
  | 'task_deadline_changed'
  | 'task_priority_changed'
  | 'task_comment'
  | 'direct_message'
  | 'meeting_invite'
  | 'meeting_cancelled'
  | 'leave_status'
  | 'leave_pending'
  | 'announcement'
  | 'report_submitted'
  | 'report_pending';

export interface NotificationItem {
  id: string;
  user_id: string;
  type: NotificationType | string;
  title: string;
  message: string;
  reference_id: string | null;
  reference_type: string | null;
  is_read: boolean;
  created_at: string;
}

export type NotificationCategory = 'all' | 'unread' | 'tasks' | 'messages' | 'meetings' | 'reports' | 'announcements';
