import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../features/auth/AuthContext';
import { PageHeader } from '../../components/ui/PageHeader';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadingState } from '../../components/ui/LoadingState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Textarea } from '../../components/ui/Textarea';
import { Select } from '../../components/ui/Select';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { Megaphone, Plus, Clock, User } from 'lucide-react';

interface Announcement {
  id: string;
  title: string;
  content: string;
  audience: string;
  priority: string;
  created_at: string;
  author?: {
    full_name: string;
  };
}

export const AnnouncementsPage: React.FC = () => {
  const { user, role } = useAuth();
  const { showSuccess, showError } = useToast();

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    audience: 'Everyone',
    priority: 'Medium'
  });

  const canCreate = role === 'Super Admin' || role === 'Admin';

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const fetchAnnouncements = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: aErr } = await supabase
        .from('announcements')
        .select(`
          id, title, content, audience, priority, created_at,
          author:author_id ( full_name )
        `)
        .order('created_at', { ascending: false });

      if (aErr) throw aErr;

      const mapped: Announcement[] = (data || []).map((a: any) => ({
        ...a,
        author: Array.isArray(a.author) ? a.author[0] : a.author
      }));

      setAnnouncements(mapped);
    } catch (err: any) {
      console.error('Error fetching announcements:', err);
      setError(err.message || 'Failed to load announcements');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.content.trim()) {
      showError('Please fill in title and content');
      return;
    }

    try {
      setSubmitting(true);
      const { error: insErr } = await supabase
        .from('announcements')
        .insert({
          title: formData.title.trim(),
          content: formData.content.trim(),
          audience: formData.audience,
          priority: formData.priority,
          author_id: user?.id
        });

      if (insErr) throw insErr;

      showSuccess('Announcement published successfully');
      setIsCreateOpen(false);
      setFormData({ title: '', content: '', audience: 'Everyone', priority: 'Medium' });
      fetchAnnouncements();
    } catch (err: any) {
      console.error('Error creating announcement:', err);
      showError(err.message || 'Failed to publish announcement');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingState text="Loading announcements..." />;
  if (error) return <ErrorState message={error} onRetry={fetchAnnouncements} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Announcements"
        description="Company-wide updates, notices, and operational announcements"
        icon={<Megaphone className="h-6 w-6" />}
        actions={
          canCreate && (
            <Button onClick={() => setIsCreateOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              New Announcement
            </Button>
          )
        }
      />

      {announcements.length === 0 ? (
        <EmptyState
          title="No announcements posted yet"
          description="Operational notices and team updates will appear here."
          icon={<Megaphone className="h-10 w-10 text-content-muted" />}
        />
      ) : (
        <div className="space-y-4">
          {announcements.map((item) => (
            <Card key={item.id} className="hover:border-primary/30 transition-all">
              <CardContent className="p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 border-b border-border pb-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-base sm:text-lg font-semibold text-content">{item.title}</h2>
                      <StatusBadge status={item.priority} size="sm" />
                      <span className="text-[11px] px-2 py-0.5 rounded bg-surface-muted text-content-muted border border-border">
                        Audience: {item.audience}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-content-muted mt-1">
                      <span className="flex items-center gap-1">
                        <User className="h-3.5 w-3.5" />
                        {item.author?.full_name || 'Management'}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {new Date(item.created_at).toLocaleDateString()} at{' '}
                        {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-3 text-sm text-content whitespace-pre-wrap leading-relaxed">
                  {item.content}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Creation Modal */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Post New Announcement"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-content mb-1">Title</label>
            <Input
              placeholder="Announcement title..."
              value={formData.title}
              onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-content mb-1">Target Audience</label>
              <Select
                value={formData.audience}
                onChange={(e) => setFormData(prev => ({ ...prev, audience: e.target.value }))}
              >
                <option value="Everyone">Everyone</option>
                <option value="Employees">Employees Only</option>
                <option value="Interns">Interns Only</option>
              </Select>
            </div>

            <div>
              <label className="block text-xs font-medium text-content mb-1">Priority</label>
              <Select
                value={formData.priority}
                onChange={(e) => setFormData(prev => ({ ...prev, priority: e.target.value }))}
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Urgent">Urgent</option>
              </Select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-content mb-1">Content</label>
            <Textarea
              placeholder="Write the announcement details..."
              rows={4}
              value={formData.content}
              onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
              required
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsCreateOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" isLoading={submitting}>
              Publish Announcement
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
