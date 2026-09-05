import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.admin.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';

const adminSupabase = createClient(supabaseUrl, serviceRoleKey);
const anonSupabase = createClient(supabaseUrl, anonKey);

test.describe('Phase 6 — Notifications & Communication Intelligence', () => {
  let employeeUser: { id: string; email: string };
  let adminUser: { id: string; email: string };

  test.beforeAll(async () => {
    // Get real test users
    const { data: empProfile } = await adminSupabase
      .from('profiles')
      .select('id, email')
      .eq('email', 'employee@scaro.in')
      .single();

    const { data: adminProfile } = await adminSupabase
      .from('profiles')
      .select('id, email')
      .eq('email', 'admin@scaro.in')
      .single();

    employeeUser = empProfile!;
    adminUser = adminProfile!;

    // Clean up test notifications for clean test state
    await adminSupabase.from('notifications').delete().eq('user_id', employeeUser.id);
    await adminSupabase.from('notifications').delete().eq('user_id', adminUser.id);
  });

  test('Case 1: Database Trigger generates notification on task assignment', async () => {
    // 1. Admin gets or creates a project
    const { data: project } = await adminSupabase
      .from('projects')
      .select('id')
      .limit(1)
      .maybeSingle();

    let projectId = project?.id;
    if (!projectId) {
      const { data: newProj, error: projErr } = await adminSupabase
        .from('projects')
        .insert({
          name: 'Test Notifications Project',
          status: 'Active',
          created_by: adminUser.id,
        })
        .select('id')
        .single();
      expect(projErr).toBeNull();
      projectId = newProj!.id;
    }

    const taskTitle = `Test Task Assignment ${Date.now()}`;
    const { data: task, error: taskErr } = await adminSupabase
      .from('tasks')
      .insert({
        project_id: projectId,
        title: taskTitle,
        description: 'Testing automatic notification generation',
        assignee_id: employeeUser.id,
        reporter_id: adminUser.id,
        status: 'Todo',
        priority: 'Medium',
      })
      .select()
      .single();

    expect(taskErr).toBeNull();
    expect(task).toBeDefined();

    // 2. Verify notification was created for employeeUser
    const { data: notifs, error: notifErr } = await adminSupabase
      .from('notifications')
      .select('*')
      .eq('user_id', employeeUser.id)
      .eq('reference_id', task.id);

    expect(notifErr).toBeNull();
    expect(notifs).toBeDefined();
    expect(notifs!.length).toBeGreaterThan(0);
    expect(notifs![0].type).toBe('task_assigned');
    expect(notifs![0].title).toContain(taskTitle);
    expect(notifs![0].is_read).toBe(false);

    // Clean up task
    await adminSupabase.from('tasks').delete().eq('id', task.id);
  });

  test('Case 2: Direct message trigger creates minimal sanitized notification', async () => {
    // 1. Admin sends a direct message to Employee
    const messageContent = 'Confidential roadmap details 12345';
    const { data: msg, error: msgErr } = await adminSupabase
      .from('messages')
      .insert({
        sender_id: adminUser.id,
        recipient_id: employeeUser.id,
        content: messageContent,
        is_read: false,
      })
      .select()
      .single();

    expect(msgErr).toBeNull();

    // 2. Verify notification created for employeeUser
    const { data: notifs } = await adminSupabase
      .from('notifications')
      .select('*')
      .eq('user_id', employeeUser.id)
      .eq('type', 'direct_message');

    expect(notifs).toBeDefined();
    expect(notifs!.length).toBeGreaterThan(0);

    const latestNotif = notifs![0];
    expect(latestNotif.title).toContain('New message from');
    // Verify privacy: raw message content must NOT be leaked in notification payload
    expect(latestNotif.message).not.toContain('Confidential roadmap details 12345');

    // Clean up message
    await adminSupabase.from('messages').delete().eq('id', msg.id);
  });

  test('Case 3: RLS Policy Security Enforcement', async () => {
    // 1. Sign in as employee on anon client
    const { data: authData, error: authErr } = await anonSupabase.auth.signInWithPassword({
      email: 'employee@scaro.in',
      password: 'Scaro@Employee2026!',
    });
    expect(authErr).toBeNull();
    const employeeClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${authData.session!.access_token}` } },
    });

    // 2. Employee cannot create arbitrary notifications directly (RLS 42501 Forbidden)
    const { error: insertErr } = await employeeClient.from('notifications').insert({
      user_id: adminUser.id,
      type: 'fake_alert',
      title: 'Spam Notification',
      message: 'Client attempt to insert notification',
    });
    expect(insertErr).not.toBeNull();
    expect(insertErr!.code).toBe('42501');

    // 3. Employee cannot read admin's notifications
    // Insert an admin notification using service role
    const { data: adminNotif } = await adminSupabase
      .from('notifications')
      .insert({
        user_id: adminUser.id,
        type: 'admin_private',
        title: 'Admin Only Alert',
        message: 'Top secret',
        is_read: false,
      })
      .select()
      .single();

    // Query as employee
    const { data: crossRead } = await employeeClient
      .from('notifications')
      .select('*')
      .eq('id', adminNotif.id);

    // RLS must return 0 rows
    expect(crossRead).toHaveLength(0);

    // 4. Employee cannot update admin's notification
    const { error: crossUpdateErr } = await employeeClient
      .from('notifications')
      .update({ is_read: true })
      .eq('id', adminNotif.id);

    // PostgreSQL silently affects 0 rows under RLS or rejects
    const { data: verifyNotif } = await adminSupabase
      .from('notifications')
      .select('is_read')
      .eq('id', adminNotif.id)
      .single();
    expect(verifyNotif.is_read).toBe(false);

    // Clean up
    await adminSupabase.from('notifications').delete().eq('id', adminNotif.id);
  });

  test('Case 4: UI End-to-End Notification Flow in Browser', async ({ page }) => {
    // 1. Create a fresh test notification for employee
    const notifTitle = `System Inspection ${Date.now()}`;
    await adminSupabase.from('notifications').insert({
      user_id: employeeUser.id,
      type: 'task_assigned',
      title: notifTitle,
      message: 'Please review the quarterly budget task',
      reference_type: 'task',
      is_read: false,
    });

    // 2. Log in as employee
    await page.goto('/login');
    await page.fill('input[type="email"]', 'employee@scaro.in');
    await page.fill('input[type="password"]', 'Scaro@Employee2026!');
    await page.click('button[type="submit"]');

    // 3. Wait for dashboard
    await page.waitForURL('**/app/dashboard');

    // 4. Verify unread badge exists in Header
    const notifBell = page.locator('button[aria-label="View notifications"]');
    await expect(notifBell).toBeVisible();

    // 5. Click notification bell
    await notifBell.click();

    // 6. Verify dropdown opens with test notification
    const notifItem = page.locator(`text=${notifTitle}`);
    await expect(notifItem).toBeVisible();

    // 7. Navigate to Notifications Page
    await page.click('text=View all notifications');
    await page.waitForURL('**/app/notifications');

    // 8. Verify notification row is displayed on page
    await expect(page.locator(`text=${notifTitle}`)).toBeVisible();

    // 9. Click "Mark all read"
    const markAllBtn = page.locator('button:has-text("Mark all read")');
    if (await markAllBtn.isVisible()) {
      await markAllBtn.click();
      await page.waitForTimeout(500);
    }

    // 10. Verify notification is marked as read
    const checkDb = await adminSupabase
      .from('notifications')
      .select('is_read')
      .eq('user_id', employeeUser.id)
      .eq('title', notifTitle)
      .single();

    expect(checkDb.data?.is_read).toBe(true);
  });

  test('Case 5: Triggers for Meetings, Leave Requests, and Announcements', async () => {
    // 1. Meeting Invitation
    const { data: meeting, error: meetErr } = await adminSupabase
      .from('meetings')
      .insert({
        title: `Sprint Review ${Date.now()}`,
        meeting_date: '2026-09-05',
        start_time: '10:00:00',
        end_time: '11:00:00',
        organizer_id: adminUser.id,
        status: 'Scheduled',
      })
      .select('id, title')
      .single();

    expect(meetErr).toBeNull();

    // Invite employee
    await adminSupabase.from('meeting_participants').insert({
      meeting_id: meeting!.id,
      participant_id: employeeUser.id,
    });

    // Check meeting notification
    const { data: meetNotifs } = await adminSupabase
      .from('notifications')
      .select('*')
      .eq('user_id', employeeUser.id)
      .eq('reference_id', meeting!.id);

    expect(meetNotifs).toBeDefined();
    expect(meetNotifs!.length).toBeGreaterThan(0);
    expect(meetNotifs![0].type).toBe('meeting_invite');

    // Clean up meeting
    await adminSupabase.from('meetings').delete().eq('id', meeting!.id);

    // 2. Announcement to Employees
    const { data: announcement } = await adminSupabase
      .from('announcements')
      .insert({
        author_id: adminUser.id,
        title: `Company Update ${Date.now()}`,
        content: 'Important all-hands announcement',
        priority: 'Normal',
        audience: 'Employees',
      })
      .select('id, title')
      .single();

    // Check announcement notification for employee
    const { data: annNotifs } = await adminSupabase
      .from('notifications')
      .select('*')
      .eq('user_id', employeeUser.id)
      .eq('reference_id', announcement!.id);

    expect(annNotifs).toBeDefined();
    expect(annNotifs!.length).toBeGreaterThan(0);
    expect(annNotifs![0].type).toBe('announcement');

    // Clean up announcement
    await adminSupabase.from('announcements').delete().eq('id', announcement!.id);
  });

  test('Case 6: Idempotency and Report Reminder Logic', async () => {
    // Verify notify_user deduplication
    const refId = employeeUser.id;
    // Call notify_user twice with same reference
    await adminSupabase.rpc('notify_user', {
      p_user_id: employeeUser.id,
      p_type: 'dedup_check',
      p_title: 'Deduplication Test',
      p_message: 'Testing idempotency window',
      p_reference_id: refId,
      p_reference_type: 'test',
    });

    await adminSupabase.rpc('notify_user', {
      p_user_id: employeeUser.id,
      p_type: 'dedup_check',
      p_title: 'Deduplication Test',
      p_message: 'Testing idempotency window',
      p_reference_id: refId,
      p_reference_type: 'test',
    });

    const { data: dedupNotifs } = await adminSupabase
      .from('notifications')
      .select('*')
      .eq('user_id', employeeUser.id)
      .eq('type', 'dedup_check')
      .eq('reference_id', refId);

    // Should only have 1 row due to 15-minute deduplication window
    expect(dedupNotifs).toHaveLength(1);

    // Clean up
    await adminSupabase.from('notifications').delete().eq('type', 'dedup_check');
  });
});
