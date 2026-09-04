import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { LoadingState } from '../../components/ui/LoadingState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Textarea } from '../../components/ui/Textarea';
import { Select } from '../../components/ui/Select';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useToast } from '../../components/ui/Toast';
import { Users, Calendar as CalendarIcon, Clock, Link as LinkIcon, User, Plus, Video } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../features/auth/AuthContext';

interface Meeting {
  id: string;
  title: string;
  description: string;
  meeting_date: string;
  start_time: string;
  end_time: string;
  meeting_type?: string;
  external_meeting_url?: string;
  organizer_id: string;
  organizer?: { full_name: string };
}

interface MeetingParticipant {
  meeting_id: string;
  participant_id: string;
  participant?: { full_name: string; email: string };
}

export const MeetingsPage: React.FC = () => {
  const { user, role } = useAuth();
  const { showSuccess, showError } = useToast();
  const canCreateMeeting = role !== 'Intern';

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [participants, setParticipants] = useState<MeetingParticipant[]>([]);
  const [participantsLoading, setParticipantsLoading] = useState(false);

  // Schedule Meeting Modal
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({
    title: '',
    description: '',
    meeting_date: new Date().toISOString().split('T')[0],
    start_time: '10:00:00',
    end_time: '11:00:00',
    meeting_type: 'Internal Sync',
    external_meeting_url: ''
  });

  const getMeetingDateTime = (dateStr: string, timeStr: string) => {
    if (!dateStr) return new Date();
    const t = timeStr ? (timeStr.length === 5 ? `${timeStr}:00` : timeStr) : '00:00:00';
    return new Date(`${dateStr}T${t}`);
  };

  useEffect(() => {
    fetchMeetings();
  }, [user]);

  const fetchMeetings = async () => {
    if (!user) return;
    try {
      setLoading(true);
      setError(null);

      // 1. Meetings organized by user
      const { data: orgData, error: orgErr } = await supabase
        .from('meetings')
        .select(`
          id, title, description, meeting_date, start_time, end_time, meeting_type, external_meeting_url, organizer_id,
          organizer:organizer_id ( full_name )
        `)
        .eq('organizer_id', user.id);
        
      if (orgErr) throw orgErr;

      // 2. Meetings where user is participant
      const { data: partData, error: partErr } = await supabase
        .from('meeting_participants')
        .select(`
          meeting:meeting_id (
            id, title, description, meeting_date, start_time, end_time, meeting_type, external_meeting_url, organizer_id,
            organizer:organizer_id ( full_name )
          )
        `)
        .eq('participant_id', user.id);
        
      if (partErr) throw partErr;

      const allMeetingsMap = new Map<string, Meeting>();
      
      if (orgData) {
        orgData.forEach((m: any) => allMeetingsMap.set(m.id, m as Meeting));
      }
      
      if (partData) {
        partData.forEach((p: any) => {
          const m = p.meeting;
          if (m) allMeetingsMap.set(m.id, m as Meeting);
        });
      }

      // Sort by combined meeting_date + start_time
      const sortedMeetings = Array.from(allMeetingsMap.values()).sort((a, b) => {
        const timeA = getMeetingDateTime(a.meeting_date, a.start_time).getTime();
        const timeB = getMeetingDateTime(b.meeting_date, b.start_time).getTime();
        return timeA - timeB;
      });
      
      setMeetings(sortedMeetings);
    } catch (err: any) {
      console.error('Error loading meetings:', err);
      setError(err.message || 'Failed to load meetings');
    } finally {
      setLoading(false);
    }
  };

  const openMeeting = async (meeting: Meeting) => {
    setSelectedMeeting(meeting);
    fetchParticipants(meeting.id);
  };

  const fetchParticipants = async (meetingId: string) => {
    try {
      setParticipantsLoading(true);
      const { data, error: pErr } = await supabase
        .from('meeting_participants')
        .select(`
          meeting_id, participant_id,
          participant:participant_id ( full_name, email )
        `)
        .eq('meeting_id', meetingId);

      if (pErr) throw pErr;
      setParticipants((data as any) || []);
    } catch (err: any) {
      console.error('Failed to fetch participants:', err);
    } finally {
      setParticipantsLoading(false);
    }
  };

  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (role === 'Intern') {
      showError('Unauthorized: Interns are not permitted to schedule meetings');
      return;
    }

    if (!scheduleForm.title.trim()) {
      showError('Please provide a meeting title');
      return;
    }

    try {
      setScheduling(true);
      const { error: insErr } = await supabase
        .from('meetings')
        .insert({
          title: scheduleForm.title.trim(),
          description: scheduleForm.description.trim(),
          meeting_date: scheduleForm.meeting_date,
          start_time: scheduleForm.start_time,
          end_time: scheduleForm.end_time,
          meeting_type: scheduleForm.meeting_type,
          external_meeting_url: scheduleForm.external_meeting_url.trim() || null,
          organizer_id: user?.id
        });

      if (insErr) throw insErr;

      showSuccess('Meeting scheduled successfully');
      setIsScheduleOpen(false);
      setScheduleForm({
        title: '',
        description: '',
        meeting_date: new Date().toISOString().split('T')[0],
        start_time: '10:00:00',
        end_time: '11:00:00',
        meeting_type: 'Internal Sync',
        external_meeting_url: ''
      });
      fetchMeetings();
    } catch (err: any) {
      console.error('Error scheduling meeting:', err);
      showError(err.message || 'Failed to schedule meeting');
    } finally {
      setScheduling(false);
    }
  };

  if (loading) return <LoadingState text="Loading meetings schedule..." />;
  if (error) return <ErrorState message={error} onRetry={fetchMeetings} />;

  const nowTime = new Date().getTime();
  const upcomingMeetings = meetings.filter(m => getMeetingDateTime(m.meeting_date, m.end_time).getTime() >= nowTime);
  const pastMeetings = meetings.filter(m => getMeetingDateTime(m.meeting_date, m.end_time).getTime() < nowTime);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-content flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" /> Meetings & Syncs
          </h1>
          <p className="text-xs sm:text-sm text-content-muted mt-0.5">
            Coordinate standups, client discussions, reviews, and sync sessions
          </p>
        </div>
        {canCreateMeeting && (
          <Button 
            id="schedule-meeting-button"
            data-testid="schedule-meeting-button"
            onClick={() => setIsScheduleOpen(true)} 
            className="gap-2"
          >
            <Plus className="h-4 w-4" /> Schedule Meeting
          </Button>
        )}
      </div>

      <div className="space-y-8">
        {/* Upcoming Meetings */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-content-muted mb-3 flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 text-primary" /> Upcoming Meetings ({upcomingMeetings.length})
          </h2>

          {upcomingMeetings.length === 0 ? (
            <div className="py-10 text-center bg-surface border border-border rounded-lg">
              <CalendarIcon className="h-10 w-10 text-content-muted mx-auto mb-2 opacity-50" />
              <p className="text-content font-medium text-sm">No upcoming meetings</p>
              <p className="text-content-muted text-xs mt-1">Your schedule is currently clear.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {upcomingMeetings.map(meeting => (
                <Card 
                  key={meeting.id} 
                  className="hover:border-primary/50 transition-all cursor-pointer" 
                  onClick={() => openMeeting(meeting)}
                >
                  <CardHeader className="pb-2 border-b border-border">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base font-semibold text-content line-clamp-1">
                        {meeting.title}
                      </CardTitle>
                      <StatusBadge status={meeting.meeting_type || 'Internal'} size="sm" />
                    </div>
                  </CardHeader>
                  <CardContent className="pt-3 space-y-2 text-xs text-content-muted">
                    <div className="flex items-center gap-2 text-content">
                      <Clock className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span>{meeting.meeting_date} ({meeting.start_time?.slice(0, 5)} - {meeting.end_time?.slice(0, 5)})</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <User className="h-3.5 w-3.5 shrink-0" />
                      <span>Organized by {meeting.organizer?.full_name || 'Team Member'}</span>
                    </div>

                    {meeting.external_meeting_url && (
                      <div className="flex items-center gap-2 text-primary pt-1 truncate">
                        <Video className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{meeting.external_meeting_url}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* Past Meetings */}
        {pastMeetings.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-content-muted mb-3 flex items-center gap-2">
              <Clock className="h-4 w-4" /> Past Meetings ({pastMeetings.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 opacity-75">
              {pastMeetings.map(meeting => (
                <Card key={meeting.id} className="cursor-pointer hover:opacity-100" onClick={() => openMeeting(meeting)}>
                  <CardHeader className="pb-2 border-b border-border">
                    <CardTitle className="text-sm font-medium text-content line-clamp-1">{meeting.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-2 text-xs text-content-muted space-y-1">
                    <div>{meeting.meeting_date} at {meeting.start_time?.slice(0, 5)}</div>
                    <div>Organizer: {meeting.organizer?.full_name || 'Team Member'}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Schedule Meeting Modal */}
      <Modal
        isOpen={isScheduleOpen}
        onClose={() => setIsScheduleOpen(false)}
        title="Schedule New Meeting"
      >
        <form onSubmit={handleScheduleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-content mb-1">Meeting Title</label>
            <Input
              placeholder="e.g. Daily Standup / Project Kickoff..."
              value={scheduleForm.title}
              onChange={(e) => setScheduleForm(prev => ({ ...prev, title: e.target.value }))}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-content mb-1">Date</label>
              <Input
                type="date"
                value={scheduleForm.meeting_date}
                onChange={(e) => setScheduleForm(prev => ({ ...prev, meeting_date: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-content mb-1">Start Time</label>
              <Input
                type="time"
                step="1"
                value={scheduleForm.start_time}
                onChange={(e) => setScheduleForm(prev => ({ ...prev, start_time: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-content mb-1">End Time</label>
              <Input
                type="time"
                step="1"
                value={scheduleForm.end_time}
                onChange={(e) => setScheduleForm(prev => ({ ...prev, end_time: e.target.value }))}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-content mb-1">Meeting Type</label>
              <Select
                value={scheduleForm.meeting_type}
                onChange={(e) => setScheduleForm(prev => ({ ...prev, meeting_type: e.target.value }))}
              >
                <option value="Internal Sync">Internal Sync</option>
                <option value="Client Call">Client Call</option>
                <option value="1-on-1 Review">1-on-1 Review</option>
                <option value="All Hands">All Hands</option>
              </Select>
            </div>
            <div>
              <label className="block text-xs font-medium text-content mb-1">Meeting Link (URL)</label>
              <Input
                type="url"
                placeholder="https://meet.google.com/..."
                value={scheduleForm.external_meeting_url}
                onChange={(e) => setScheduleForm(prev => ({ ...prev, external_meeting_url: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-content mb-1">Agenda / Description</label>
            <Textarea
              placeholder="Outline the goals and agenda..."
              rows={3}
              value={scheduleForm.description}
              onChange={(e) => setScheduleForm(prev => ({ ...prev, description: e.target.value }))}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsScheduleOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" isLoading={scheduling}>
              Schedule
            </Button>
          </div>
        </form>
      </Modal>

      {/* Meeting Detail Inspection Modal */}
      {selectedMeeting && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedMeeting(null)}
          title={selectedMeeting.title}
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-surface-muted rounded-lg border border-border space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-content-muted">Date & Time:</span>
                <span className="font-semibold text-content">
                  {selectedMeeting.meeting_date} ({selectedMeeting.start_time?.slice(0, 5)} - {selectedMeeting.end_time?.slice(0, 5)})
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-content-muted">Organizer:</span>
                <span className="font-medium text-content">{selectedMeeting.organizer?.full_name || 'Team Member'}</span>
              </div>
              {selectedMeeting.external_meeting_url && (
                <div className="flex items-center justify-between pt-1 border-t border-border">
                  <span className="text-content-muted">Join Link:</span>
                  <a 
                    href={selectedMeeting.external_meeting_url} 
                    target="_blank" 
                    rel="noreferrer"
                    className="text-primary font-medium hover:underline flex items-center gap-1"
                  >
                    <LinkIcon className="h-3 w-3" /> Open Meeting
                  </a>
                </div>
              )}
            </div>

            {selectedMeeting.description && (
              <div>
                <h4 className="font-semibold text-content mb-1">Agenda & Notes:</h4>
                <p className="p-3 bg-surface border border-border rounded-lg text-content whitespace-pre-wrap">
                  {selectedMeeting.description}
                </p>
              </div>
            )}

            <div>
              <h4 className="font-semibold text-content mb-1.5">Participants ({participants.length}):</h4>
              {participantsLoading ? (
                <p className="text-content-muted">Loading participants...</p>
              ) : participants.length === 0 ? (
                <p className="text-content-muted">No other participants listed.</p>
              ) : (
                <div className="space-y-1">
                  {participants.map(p => (
                    <div key={p.participant_id} className="flex items-center justify-between p-2 rounded bg-surface-muted">
                      <span>{p.participant?.full_name || p.participant?.email || p.participant_id}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={() => setSelectedMeeting(null)} size="sm">
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
