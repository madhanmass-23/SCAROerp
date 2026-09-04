import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '../../components/ui/Card';
import { LoadingState } from '../../components/ui/LoadingState';
import { ErrorState } from '../../components/ui/ErrorState';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';
import { Calendar, Clock, LogIn, LogOut, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../features/auth/AuthContext';

interface AttendanceRecord {
  id: string;
  user_id: string;
  session_date: string;
  clock_in_time: string | null;
  clock_out_time: string | null;
  status: string;
  user?: { full_name: string };
}

export const AttendancePage: React.FC = () => {
  const { user, role } = useAuth();
  const { showSuccess, showError, showInfo } = useToast();

  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'my_attendance' | 'team_attendance'>('my_attendance');

  const isSupervisor = role === 'Super Admin' || role === 'Admin';
  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    fetchAttendance();
  }, [user, activeTab]);

  const fetchAttendance = async () => {
    if (!user) return;
    try {
      setLoading(true);
      setError(null);
      
      const query = supabase
        .from('attendance_sessions')
        .select(`
          id, user_id, session_date, clock_in_time, clock_out_time, status,
          user:user_id ( full_name )
        `)
        .order('session_date', { ascending: false })
        .limit(50);

      if (activeTab === 'my_attendance') {
        query.eq('user_id', user.id);
      }
      
      const { data, error: fetchErr } = await query;
      if (fetchErr) throw fetchErr;

      setRecords((data as any) || []);
    } catch (err: any) {
      console.error('Error fetching attendance:', err);
      setError(err.message || 'Failed to load attendance');
    } finally {
      setLoading(false);
    }
  };

  const todayRecord = records.find(r => r.session_date === today && r.user_id === user?.id);

  const handleClockAction = async (type: 'in' | 'out') => {
    if (!user) return;
    try {
      setActionLoading(true);
      const now = new Date().toISOString();

      if (type === 'in') {
        if (todayRecord) {
          showInfo('You have already clocked in today.');
          return;
        }
        
        const { error: inErr } = await supabase.from('attendance_sessions').insert({
          user_id: user.id,
          session_date: today,
          clock_in_time: now,
          status: 'Present'
        });
        
        if (inErr) throw inErr;
        showSuccess('Clocked in successfully at ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      } else {
        if (!todayRecord || !todayRecord.clock_in_time) {
          showError('You must clock in before clocking out.');
          return;
        }
        if (todayRecord.clock_out_time) {
          showInfo('You have already clocked out for today.');
          return;
        }
        
        const { error: outErr } = await supabase
          .from('attendance_sessions')
          .update({
            clock_out_time: now
          })
          .eq('id', todayRecord.id);
          
        if (outErr) throw outErr;
        showSuccess('Clocked out successfully at ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      }
      
      fetchAttendance();
    } catch (err: any) {
      console.error('Attendance error:', err);
      showError(err.message || 'Failed to update attendance');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <LoadingState text="Loading attendance records..." />;
  if (error) return <ErrorState message={error} onRetry={fetchAttendance} />;

  const isClockedIn = !!todayRecord?.clock_in_time;
  const isClockedOut = !!todayRecord?.clock_out_time;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance & Time Tracking"
        description="Daily check-ins, shift duration, and attendance history"
        icon={<Calendar className="h-6 w-6" />}
      />

      {/* Prominent Quick Action Card for Today */}
      <Card className="border-primary/20 bg-gradient-to-r from-surface to-surface-muted">
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="p-3 rounded-full bg-primary/10 text-primary shrink-0">
                <Clock className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-content-muted">Today's Session</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <h3 className="text-base sm:text-lg font-bold text-content">
                    {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
                  </h3>
                  {isClockedOut ? (
                    <StatusBadge status="Completed" size="sm" />
                  ) : isClockedIn ? (
                    <StatusBadge status="Present" size="sm" />
                  ) : (
                    <span className="text-[11px] px-2 py-0.5 rounded bg-surface-muted text-content-muted border border-border">
                      Not Clocked In
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-content-muted mt-1">
                  <span>In: {todayRecord?.clock_in_time ? new Date(todayRecord.clock_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</span>
                  <span>•</span>
                  <span>Out: {todayRecord?.clock_out_time ? new Date(todayRecord.clock_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 self-stretch sm:self-auto">
              {!isClockedIn ? (
                <Button
                  onClick={() => handleClockAction('in')}
                  isLoading={actionLoading}
                  className="w-full sm:w-auto gap-2"
                >
                  <LogIn className="h-4 w-4" /> Clock In
                </Button>
              ) : !isClockedOut ? (
                <Button
                  onClick={() => handleClockAction('out')}
                  variant="outline"
                  isLoading={actionLoading}
                  className="w-full sm:w-auto gap-2 border-primary text-primary hover:bg-primary/10"
                >
                  <LogOut className="h-4 w-4" /> Clock Out
                </Button>
              ) : (
                <div className="flex items-center gap-1.5 text-xs text-status-success font-medium bg-status-success/10 px-3 py-2 rounded-lg">
                  <CheckCircle2 className="h-4 w-4" /> Shift Finished Today
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs for Supervisor */}
      {isSupervisor && (
        <div className="flex items-center gap-2 border-b border-border pb-1">
          <button
            type="button"
            onClick={() => setActiveTab('my_attendance')}
            className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition-colors ${
              activeTab === 'my_attendance'
                ? 'bg-surface text-primary border-b-2 border-primary'
                : 'text-content-muted hover:text-content'
            }`}
          >
            My Attendance
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('team_attendance')}
            className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition-colors ${
              activeTab === 'team_attendance'
                ? 'bg-surface text-primary border-b-2 border-primary'
                : 'text-content-muted hover:text-content'
            }`}
          >
            Team Attendance
          </button>
        </div>
      )}

      {/* History List */}
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-content-muted mb-3">
          Recent Attendance History ({records.length})
        </h3>

        {records.length === 0 ? (
          <EmptyState
            title="No attendance records found"
            description="Your daily clock-ins and clock-outs will be listed here."
            icon={<Calendar className="h-10 w-10 text-content-muted" />}
          />
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden sm:block">
              <Card>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-content">
                    <thead className="bg-surface-muted border-b border-border text-content-muted uppercase tracking-wider font-semibold">
                      <tr>
                        {activeTab === 'team_attendance' && <th className="py-3 px-4">Member</th>}
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-4">Clock In</th>
                        <th className="py-3 px-4">Clock Out</th>
                        <th className="py-3 px-4">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {records.map((r) => (
                        <tr key={r.id} className="hover:bg-surface-muted/50 transition-colors">
                          {activeTab === 'team_attendance' && (
                            <td className="py-3 px-4 font-medium text-content">
                              {r.user?.full_name || 'Member'}
                            </td>
                          )}
                          <td className="py-3 px-4 whitespace-nowrap text-content">
                            {r.session_date}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap text-content-muted">
                            {r.clock_in_time ? new Date(r.clock_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap text-content-muted">
                            {r.clock_out_time ? new Date(r.clock_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <StatusBadge status={r.status || 'Present'} size="sm" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>

            {/* Mobile Card List View (<640px) */}
            <div className="sm:hidden space-y-3">
              {records.map((r) => (
                <Card key={r.id}>
                  <CardContent className="p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-content">{r.session_date}</span>
                      <StatusBadge status={r.status || 'Present'} size="sm" />
                    </div>
                    {activeTab === 'team_attendance' && (
                      <p className="text-xs text-content-muted">{r.user?.full_name || 'Member'}</p>
                    )}
                    <div className="flex items-center justify-between text-xs text-content-muted pt-1 border-t border-border">
                      <span>In: {r.clock_in_time ? new Date(r.clock_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</span>
                      <span>Out: {r.clock_out_time ? new Date(r.clock_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
