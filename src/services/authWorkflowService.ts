import { supabase } from '../lib/supabase';
import type { NavigateFunction } from 'react-router-dom';

/**
 * Checks whether today's Daily Summary is submitted for the given user.
 */
export async function isTodayDailySummarySubmitted(userId: string): Promise<boolean> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('daily_reports')
      .select('id, status')
      .eq('user_id', userId)
      .eq('report_date', today)
      .maybeSingle();

    if (error) {
      console.error('Error checking daily report status:', error);
      return false;
    }

    if (!data) return false;
    return (data.status || '').toLowerCase() === 'submitted';
  } catch (err) {
    console.error('Failed to verify daily report status:', err);
    return false;
  }
}

/**
 * Records attendance clock-out time and finalizes the workday session.
 */
export async function finalizeWorkdaySignOut(userId: string): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const nowIso = new Date().toISOString();

  try {
    const { data: session } = await supabase
      .from('attendance_sessions')
      .select('id, clock_out_time')
      .eq('user_id', userId)
      .eq('session_date', today)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (session) {
      // Finalize session with clock-out timestamp
      await supabase
        .from('attendance_sessions')
        .update({
          clock_out_time: nowIso,
          status: 'Present',
          updated_at: nowIso,
        })
        .eq('id', session.id);
    } else {
      // Create session if none existed
      await supabase
        .from('attendance_sessions')
        .insert({
          user_id: userId,
          session_date: today,
          clock_in_time: nowIso,
          clock_out_time: nowIso,
          status: 'Present',
        });
    }
  } catch (err) {
    console.error('Error recording attendance clock-out:', err);
  } finally {
    // Terminate Supabase authentication session
    await supabase.auth.signOut();
  }
}

/**
 * Global Logout handler for Header & Navigation.
 * - Admin / Super Admin: Immediate sign out.
 * - Employee / Intern:
 *     If today's daily summary is NOT submitted:
 *       Blocks logout, keeps session active, navigates to /app/tracker with notice.
 *     If today's daily summary IS submitted:
 *       Finalizes attendance session, signs out, and navigates to /login with success message.
 */
export async function executeAppLogout({
  userId,
  role,
  navigate,
  onBlockLogout,
}: {
  userId?: string;
  role?: string | null;
  navigate: NavigateFunction;
  onBlockLogout?: (message: string) => void;
}): Promise<void> {
  const isSupervisor = role === 'Super Admin' || role === 'Admin';

  if (!userId || isSupervisor) {
    await supabase.auth.signOut();
    navigate('/login');
    return;
  }

  // For Employee and Intern:
  const isSubmitted = await isTodayDailySummarySubmitted(userId);

  if (!isSubmitted) {
    const warningMsg = 'Please complete your Daily Summary before logging out.';
    if (onBlockLogout) {
      onBlockLogout(warningMsg);
    }
    navigate('/app/tracker', {
      state: {
        requiredForLogout: true,
        message: warningMsg,
      },
    });
    return;
  }

  // If already submitted: proceed to finalize attendance and sign out
  await finalizeWorkdaySignOut(userId);
  navigate('/login', {
    state: {
      logoutSuccessMessage: 'Attendance captured successfully. You have been signed out.',
    },
  });
}
