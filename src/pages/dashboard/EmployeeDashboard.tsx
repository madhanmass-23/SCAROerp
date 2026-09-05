import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { LoadingState } from '../../components/ui/LoadingState';
import { ErrorState } from '../../components/ui/ErrorState';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { CheckSquare, Calendar, FileText, Clock, ArrowRight, Target, LogIn } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../features/auth/AuthContext';
import { Link } from 'react-router-dom';
import { extractTodayPlan } from '../../utils/dailyReport';

interface EmployeeDashboardData {
  hasClockedIn: boolean;
  hasSubmittedReport: boolean;
  todayPlan: string | null;
  pendingTasksCount: number;
  upcomingMeetingsCount: number;
  recentTasks: any[];
}

export const EmployeeDashboard: React.FC = () => {
  const { user, profile } = useAuth();
  const [data, setData] = useState<EmployeeDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!user) return;

    async function fetchDashboardData() {
      try {
        setLoading(true);
        const today = new Date().toISOString().split('T')[0];

        // 1. Check Attendance for today
        const { data: attendanceData, error: attErr } = await supabase
          .from('attendance_sessions')
          .select('id, clock_in_time, clock_out_time')
          .eq('user_id', user!.id)
          .eq('session_date', today)
          .maybeSingle();

        if (attErr) throw attErr;

        // 2. Check Daily Report for today
        const { data: reportData, error: repErr } = await supabase
          .from('daily_reports')
          .select('id, status, notes, tomorrow_plan')
          .eq('user_id', user!.id)
          .eq('report_date', today)
          .maybeSingle();

        if (repErr) throw repErr;

        // Extract today's morning plan strictly from notes
        const planText = extractTodayPlan(reportData?.notes);

        // 3. Count Pending Tasks
        const { count: pendingTasks, error: taskErr } = await supabase
          .from('tasks')
          .select('*', { count: 'exact', head: true })
          .eq('assignee_id', user!.id)
          .neq('status', 'Completed');

        if (taskErr) throw taskErr;

        // 4. Fetch 3 Recent Pending Tasks
        const { data: recentTasks, error: recentTaskErr } = await supabase
          .from('tasks')
          .select('id, title, status, due_date')
          .eq('assignee_id', user!.id)
          .neq('status', 'Completed')
          .order('due_date', { ascending: true })
          .limit(3);

        if (recentTaskErr) throw recentTaskErr;

        // 5. Count Upcoming Meetings
        const { count: upcomingMeetings } = await supabase
          .from('meeting_participants')
          .select('meeting_id', { count: 'exact', head: true })
          .eq('participant_id', user!.id);
        
        setData({
          hasClockedIn: !!attendanceData?.clock_in_time,
          hasSubmittedReport: reportData?.status === 'submitted',
          todayPlan: planText,
          pendingTasksCount: pendingTasks || 0,
          upcomingMeetingsCount: upcomingMeetings || 0,
          recentTasks: recentTasks || []
        });

      } catch (err: any) {
        setError(err);
      } finally {
        setLoading(false);
      }
    }

    fetchDashboardData();
  }, [user]);

  if (loading) return <LoadingState text="Loading your workspace..." />;
  if (error) return <ErrorState title="Failed to load dashboard" message={error.message} onRetry={() => window.location.reload()} />;

  const firstName = profile?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || 'Employee';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-border pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-content tracking-tight">Welcome back, {firstName}!</h1>
          <p className="text-xs sm:text-sm text-content-muted mt-0.5">Here's your operational overview for today.</p>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-xs font-semibold text-primary uppercase tracking-wider">
            {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
      </div>

      {/* Today's Plan Banner */}
      {data?.todayPlan && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0 mt-0.5">
                  <Target className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-primary">Today's Focus & Plan</h2>
                  <p className="text-sm font-medium text-content mt-1 leading-relaxed whitespace-pre-wrap">
                    {data.todayPlan}
                  </p>
                </div>
              </div>
              <Link
                to="/app/tracker"
                className="text-xs font-medium text-primary hover:text-primary-hover shrink-0 underline"
              >
                Open Tracker
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Status Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center">
              <div className={`p-2.5 rounded-lg shrink-0 ${data?.hasClockedIn ? 'bg-status-success/10 text-status-success' : 'bg-status-warning/10 text-status-warning'}`}>
                <Clock className="h-5 w-5" />
              </div>
              <div className="ml-3.5 min-w-0">
                <p className="text-xs font-medium text-content-muted uppercase tracking-wider">Attendance</p>
                <p className="text-base font-bold text-content truncate mt-0.5">
                  {data?.hasClockedIn ? 'Clocked In' : 'Not Clocked In'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center">
              <div className={`p-2.5 rounded-lg shrink-0 ${data?.hasSubmittedReport ? 'bg-status-success/10 text-status-success' : 'bg-primary/10 text-primary'}`}>
                <FileText className="h-5 w-5" />
              </div>
              <div className="ml-3.5 min-w-0">
                <p className="text-xs font-medium text-content-muted uppercase tracking-wider">Daily Report</p>
                <p className="text-base font-bold text-content truncate mt-0.5">
                  {data?.hasSubmittedReport ? 'Submitted' : 'In Progress'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center">
              <div className="p-2.5 bg-primary/10 text-primary rounded-lg shrink-0">
                <CheckSquare className="h-5 w-5" />
              </div>
              <div className="ml-3.5 min-w-0">
                <p className="text-xs font-medium text-content-muted uppercase tracking-wider">My Tasks</p>
                <p className="text-base font-bold text-content truncate mt-0.5">{data?.pendingTasksCount} Pending</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center">
              <div className="p-2.5 bg-status-info/10 text-status-info rounded-lg shrink-0">
                <Calendar className="h-5 w-5" />
              </div>
              <div className="ml-3.5 min-w-0">
                <p className="text-xs font-medium text-content-muted uppercase tracking-wider">Meetings</p>
                <p className="text-base font-bold text-content truncate mt-0.5">{data?.upcomingMeetingsCount} Today</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Action Areas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-border">
            <CardTitle className="text-base font-semibold">Assigned Tasks</CardTitle>
            <Link to="/app/tasks" className="text-xs text-primary hover:text-primary-hover font-medium flex items-center">
              View All <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="flex-1 p-4 sm:p-5">
            {data?.recentTasks && data.recentTasks.length > 0 ? (
              <div className="space-y-3">
                {data.recentTasks.map(task => (
                  <div key={task.id} className="flex justify-between items-center p-3 border border-border rounded-lg hover:bg-surface-muted transition-colors">
                    <div>
                      <p className="font-medium text-content text-sm">{task.title}</p>
                      <p className="text-xs text-content-muted mt-0.5">Due: {task.due_date ? new Date(task.due_date).toLocaleDateString() : 'No deadline'}</p>
                    </div>
                    <StatusBadge status={task.status} size="sm" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center">
                <CheckSquare className="h-8 w-8 text-content-muted mx-auto mb-2 opacity-50" />
                <p className="text-content-muted text-xs">No pending tasks assigned to you right now.</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader className="pb-3 border-b border-border">
            <CardTitle className="text-base font-semibold">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 p-4 sm:p-5 flex flex-col gap-3">
             {!data?.hasClockedIn && (
               <Link to="/app/attendance" className="flex items-center p-3.5 border border-border rounded-lg hover:border-primary hover:bg-primary/5 transition-all group">
                 <div className="bg-primary/10 p-2.5 rounded-full text-primary mr-3.5 group-hover:bg-primary group-hover:text-white transition-colors">
                   <LogIn className="h-4 w-4" />
                 </div>
                 <div>
                   <p className="font-medium text-sm text-content">Clock In</p>
                   <p className="text-xs text-content-muted">Record attendance for today</p>
                 </div>
               </Link>
             )}
             
             {!data?.hasSubmittedReport && (
               <Link to="/app/tracker" className="flex items-center p-3.5 border border-border rounded-lg hover:border-primary hover:bg-primary/5 transition-all group">
                 <div className="bg-primary/10 p-2.5 rounded-full text-primary mr-3.5 group-hover:bg-primary group-hover:text-white transition-colors">
                   <FileText className="h-4 w-4" />
                 </div>
                 <div>
                   <p className="font-medium text-sm text-content">Daily Work Tracker</p>
                   <p className="text-xs text-content-muted">Update task logs and submit evidence</p>
                 </div>
               </Link>
             )}

             <Link to="/app/meetings" className="flex items-center p-3.5 border border-border rounded-lg hover:border-primary hover:bg-primary/5 transition-all group">
               <div className="bg-surface-muted p-2.5 rounded-full text-content-muted mr-3.5 group-hover:bg-primary group-hover:text-white transition-colors">
                 <Calendar className="h-4 w-4" />
               </div>
               <div>
                 <p className="font-medium text-sm text-content">Schedule / View Meetings</p>
                 <p className="text-xs text-content-muted">Check calendar and sync calls</p>
               </div>
             </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
