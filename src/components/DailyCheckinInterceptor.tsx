import React, { useEffect, useState } from 'react';
import { useAuth } from '../features/auth/AuthContext';
import { supabase } from '../lib/supabase';
import { Card, CardHeader, CardTitle, CardContent } from './ui/Card';
import { Button } from './ui/Button';
import { LoadingState } from './ui/LoadingState';
import { getTimeGreeting } from '../utils/greeting';
import { extractWorkDone, formatReportNotes } from '../utils/dailyReport';

export const DailyCheckinInterceptor: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, profile, role, loading: authLoading } = useAuth();
  const [checking, setChecking] = useState(true);
  const [needsCheckin, setNeedsCheckin] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [plan, setPlan] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [greeting, setGreeting] = useState(() => getTimeGreeting());

  useEffect(() => {
    // Keep greeting updated dynamically if user keeps page open across time boundaries
    const interval = setInterval(() => {
      setGreeting(getTimeGreeting());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    async function checkDailyReport() {
      if (authLoading) return;
      
      // Only Employee and Intern need to check in
      if (!user || (role !== 'Employee' && role !== 'Intern')) {
        setChecking(false);
        return;
      }

      try {
        const today = new Date().toISOString().split('T')[0];
        
        const { data, error: fetchErr } = await supabase
          .from('daily_reports')
          .select('id')
          .eq('user_id', user.id)
          .eq('report_date', today)
          .limit(1);

        if (fetchErr) throw fetchErr;

        if (!data || data.length === 0) {
          setNeedsCheckin(true);
        }
      } catch (err: any) {
        console.error('Error checking daily report status:', err);
        // If it fails, let them pass through rather than blocking them permanently
      } finally {
        setChecking(false);
      }
    }

    checkDailyReport();
  }, [user, role, authLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plan.trim()) {
      setError('Please provide a brief plan for today.');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      const today = new Date().toISOString().split('T')[0];
      
      // Also automatically clock them in if they haven't already
      const { data: attData } = await supabase
        .from('attendance_sessions')
        .select('id')
        .eq('user_id', user!.id)
        .eq('session_date', today)
        .limit(1);
        
      if (!attData || attData.length === 0) {
         await supabase.from('attendance_sessions').insert({
            user_id: user!.id,
            session_date: today,
            clock_in_time: new Date().toISOString(),
            status: 'Present'
         });
      }

      // Create or update the daily report draft for today
      const { data: existingReport } = await supabase
        .from('daily_reports')
        .select('id, notes, tomorrow_plan')
        .eq('user_id', user!.id)
        .eq('report_date', today)
        .maybeSingle();

      if (existingReport) {
        const existingWork = extractWorkDone(existingReport.notes);
        const updatedNotes = formatReportNotes(plan.trim(), existingWork);
        const { error: updateErr } = await supabase
          .from('daily_reports')
          .update({
            notes: updatedNotes,
            // Keep existing tomorrow_plan if any was previously entered, never copy today's plan
          })
          .eq('id', existingReport.id);
        if (updateErr) throw updateErr;
      } else {
        const { error: insertErr } = await supabase
          .from('daily_reports')
          .insert({
            user_id: user!.id,
            report_date: today,
            status: 'Draft',
            notes: formatReportNotes(plan.trim(), ''),
            tomorrow_plan: null
          });
        if (insertErr) throw insertErr;
      }

      setSaved(true);
      setTimeout(() => {
        setNeedsCheckin(false);
      }, 1200);
    } catch (err: any) {
      setError('Failed to save your check-in: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (checking || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-muted">
        <LoadingState text="Checking workspace status..." />
      </div>
    );
  }

  if (needsCheckin) {
    const firstName = profile?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || 'Team Member';

    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-surface-muted p-4">
        <div className="w-full max-w-md">
           <Card className="shadow-lg border-border">
             <CardHeader className="text-center pb-2">
               <div className="mx-auto bg-primary/10 w-14 h-14 rounded-full flex items-center justify-center mb-3 text-primary text-xl font-bold">
                 {firstName.charAt(0).toUpperCase()}
               </div>
               <CardTitle className="text-2xl font-bold text-content" data-testid="daily-checkin-greeting">
                 {greeting}, {firstName}!
               </CardTitle>
               <p className="text-content-muted text-xs sm:text-sm mt-1">
                 Let's align on today's priorities before you begin.
               </p>
             </CardHeader>
             <CardContent>
               {saved ? (
                 <div className="py-6 text-center space-y-3">
                   <div className="mx-auto w-12 h-12 rounded-full bg-status-success/10 text-status-success flex items-center justify-center text-2xl font-bold">
                     ✓
                   </div>
                   <h3 className="text-lg font-semibold text-content">Today's plan saved.</h3>
                   <p className="text-xs text-content-muted">Clocked in and ready. Loading your dashboard...</p>
                   <Button 
                     type="button" 
                     className="w-full mt-2" 
                     onClick={() => setNeedsCheckin(false)}
                   >
                     Proceed to Dashboard
                   </Button>
                 </div>
               ) : (
                 <form onSubmit={handleSubmit} className="space-y-4">
                   {error && (
                     <div className="p-3 bg-status-danger/10 text-status-danger text-xs rounded-md border border-status-danger/20">
                       {error}
                     </div>
                   )}
                   <div>
                     <label htmlFor="plan" className="block text-xs font-semibold uppercase tracking-wider text-content mb-1.5">
                       What's your plan for today?
                     </label>
                     <textarea
                       id="plan"
                       rows={4}
                       className="block w-full rounded-md border border-border bg-surface px-3 py-2 text-content shadow-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary text-sm resize-none"
                       placeholder="Outline the key tasks and objectives you intend to complete today..."
                       value={plan}
                       onChange={(e) => setPlan(e.target.value)}
                       disabled={submitting}
                       required
                     />
                   </div>
                   <Button type="submit" className="w-full" isLoading={submitting}>
                     Submit Plan & Clock In
                   </Button>
                 </form>
               )}
             </CardContent>
           </Card>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
