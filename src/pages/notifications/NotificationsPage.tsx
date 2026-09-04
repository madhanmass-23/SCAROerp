import React, { useEffect, useState } from 'react';
import { Card } from '../../components/ui/Card';
import { LoadingState } from '../../components/ui/LoadingState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Button } from '../../components/ui/Button';
import {
  Bell,
  CheckCircle2,
  Trash2,
  CheckSquare,
  MessageSquare,
  Calendar,
  ClipboardList,
  Clock,
  Megaphone,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../features/auth/AuthContext';
import { useNavigate } from 'react-router-dom';
import type { NotificationItem, NotificationCategory } from '../../types/notification';
import {
  fetchUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  getNotificationDestination,
  triggerDailyReportReminder,
} from '../../services/notificationService';

export const NotificationsPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [activeCategory, setActiveCategory] = useState<NotificationCategory>('all');

  const loadNotifications = async () => {
    if (!user) return;
    try {
      setLoading(true);
      setError(null);
      const data = await fetchUserNotifications(user.id, 100);
      setNotifications(data);
    } catch (err: any) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;

    loadNotifications();
    triggerDailyReportReminder();

    // Subscribe to realtime changes
    const subscription = supabase
      .channel(`public:notifications:page:user_id=eq.${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => {
          loadNotifications();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleMarkAsRead = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await markNotificationAsRead(id);
      setNotifications(current => current.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch (err) {
      console.error('Error marking as read:', err);
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!user) return;
    try {
      await markAllNotificationsAsRead(user.id);
      setNotifications(current => current.map(n => ({ ...n, is_read: true })));
    } catch (err) {
      console.error('Error marking all as read:', err);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteNotification(id);
      setNotifications(current => current.filter(n => n.id !== id));
    } catch (err) {
      console.error('Error deleting notification:', err);
    }
  };

  const handleItemClick = async (n: NotificationItem) => {
    if (!n.is_read) {
      await handleMarkAsRead(n.id);
    }
    const dest = getNotificationDestination(n);
    navigate(dest);
  };

  // Filter items by activeCategory
  const filteredNotifications = notifications.filter(n => {
    if (activeCategory === 'unread') return !n.is_read;
    const type = n.type.toLowerCase();
    const ref = (n.reference_type || '').toLowerCase();

    if (activeCategory === 'tasks') return ref === 'task' || type.startsWith('task');
    if (activeCategory === 'messages') return ref === 'message' || type.includes('message');
    if (activeCategory === 'meetings') return ref === 'meeting' || type.startsWith('meeting');
    if (activeCategory === 'reports') return ref === 'daily_report' || type.startsWith('report');
    if (activeCategory === 'announcements') return ref === 'announcement' || type.includes('announcement');
    return true;
  });

  // Group into Today vs Earlier
  const todayStr = new Date().toISOString().split('T')[0];
  const todayItems = filteredNotifications.filter(n => n.created_at.startsWith(todayStr));
  const earlierItems = filteredNotifications.filter(n => !n.created_at.startsWith(todayStr));

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const renderIcon = (type: string, refType: string | null) => {
    const t = type.toLowerCase();
    const r = (refType || '').toLowerCase();

    if (r === 'task' || t.startsWith('task')) {
      return <CheckSquare className="h-4 w-4 text-blue-500" />;
    }
    if (r === 'message' || t.includes('message')) {
      return <MessageSquare className="h-4 w-4 text-emerald-500" />;
    }
    if (r === 'meeting' || t.startsWith('meeting')) {
      return <Calendar className="h-4 w-4 text-indigo-500" />;
    }
    if (r === 'daily_report' || t.startsWith('report')) {
      return <ClipboardList className="h-4 w-4 text-amber-500" />;
    }
    if (r === 'leave' || t.startsWith('leave')) {
      return <Clock className="h-4 w-4 text-rose-500" />;
    }
    if (r === 'announcement' || t.includes('announcement')) {
      return <Megaphone className="h-4 w-4 text-purple-500" />;
    }
    return <Bell className="h-4 w-4 text-primary" />;
  };

  const renderNotificationRow = (n: NotificationItem) => (
    <div
      key={n.id}
      onClick={() => handleItemClick(n)}
      className={`p-4 flex items-start gap-3.5 transition-colors cursor-pointer hover:bg-surface-muted/60 ${
        !n.is_read ? 'bg-primary/5' : ''
      }`}
    >
      <div className="mt-0.5 p-2 rounded-lg bg-surface border border-border shrink-0">
        {renderIcon(n.type, n.reference_type)}
      </div>

      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className={`text-sm ${!n.is_read ? 'font-bold text-content' : 'font-medium text-content-muted'} truncate`}>
            {n.title}
          </h3>
          <span className="text-xs text-content-muted whitespace-nowrap shrink-0">
            {new Date(n.created_at).toLocaleString(undefined, {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>
        <p className="text-xs text-content-muted line-clamp-2 leading-relaxed">
          {n.message}
        </p>
      </div>

      <div className="flex items-center gap-1 shrink-0 ml-2" onClick={e => e.stopPropagation()}>
        {!n.is_read && (
          <button
            type="button"
            onClick={(e) => handleMarkAsRead(n.id, e)}
            className="p-1.5 text-primary hover:bg-primary/10 rounded-md transition-colors"
            title="Mark as read"
          >
            <CheckCircle2 className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={(e) => handleDelete(n.id, e)}
          className="p-1.5 text-content-muted hover:text-status-danger hover:bg-status-danger/10 rounded-md transition-colors"
          title="Delete"
        >
          <Trash2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => handleItemClick(n)}
          className="p-1.5 text-content-muted hover:text-primary hover:bg-surface-muted rounded-md transition-colors"
          title="Go to entity"
        >
          <ExternalLink className="h-4 w-4" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-content flex items-center gap-2.5">
            <Bell className="h-6 w-6 text-primary" /> Notifications
            {unreadCount > 0 && (
              <span className="bg-primary text-white text-xs font-bold px-2.5 py-0.5 rounded-full">
                {unreadCount} unread
              </span>
            )}
          </h1>
          <p className="text-xs text-content-muted mt-1">
            Stay updated with task assignments, direct messages, daily reports, and meetings.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Button variant="outline" size="sm" onClick={loadNotifications} className="gap-1.5 text-xs">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={handleMarkAllAsRead} className="gap-1.5 text-xs">
              <CheckCircle2 className="h-3.5 w-3.5" /> Mark all read
            </Button>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs border-b border-border">
        {(
          [
            { id: 'all', label: 'All' },
            { id: 'unread', label: `Unread (${unreadCount})` },
            { id: 'tasks', label: 'Tasks' },
            { id: 'messages', label: 'Messages' },
            { id: 'meetings', label: 'Meetings' },
            { id: 'reports', label: 'Reports' },
            { id: 'announcements', label: 'Announcements' },
          ] as { id: NotificationCategory; label: string }[]
        ).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveCategory(tab.id)}
            className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors ${
              activeCategory === tab.id
                ? 'bg-primary text-white font-semibold'
                : 'text-content-muted hover:bg-surface-muted hover:text-content'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading && notifications.length === 0 ? (
        <LoadingState text="Loading notifications..." />
      ) : error ? (
        <ErrorState title="Failed to load notifications" message={error.message} onRetry={loadNotifications} />
      ) : filteredNotifications.length === 0 ? (
        <Card className="p-12 text-center text-content-muted border border-border">
          <Bell className="h-12 w-12 mx-auto mb-3 opacity-20 text-content" />
          <p className="text-base font-semibold text-content">All caught up!</p>
          <p className="text-xs text-content-muted mt-1">You have no notifications in this view.</p>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Today Group */}
          {todayItems.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-xs font-semibold text-content uppercase tracking-wider px-1">
                Today ({todayItems.length})
              </h2>
              <Card className="divide-y divide-border overflow-hidden">
                {todayItems.map(renderNotificationRow)}
              </Card>
            </div>
          )}

          {/* Earlier Group */}
          {earlierItems.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-xs font-semibold text-content uppercase tracking-wider px-1">
                Earlier ({earlierItems.length})
              </h2>
              <Card className="divide-y divide-border overflow-hidden">
                {earlierItems.map(renderNotificationRow)}
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
