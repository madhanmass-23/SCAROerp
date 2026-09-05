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

test.describe('Phase 7 — Leave & Basic HR Operations', () => {
  let employeeUser: { id: string; email: string };
  let adminUser: { id: string; email: string };
  let internUser: { id: string; email: string };

  let employeeClient: any;
  let adminClient: any;

  test.beforeAll(async () => {
    // 1. Fetch test profiles
    const { data: empProfile } = await adminSupabase
      .from('profiles')
      .select('id, email')
      .eq('email', 'employee@scaro.in')
      .single();

    const { data: admProfile } = await adminSupabase
      .from('profiles')
      .select('id, email')
      .eq('email', 'admin@scaro.in')
      .single();

    const { data: intProfile } = await adminSupabase
      .from('profiles')
      .select('id, email')
      .eq('email', 'intern@scaro.in')
      .single();

    employeeUser = empProfile!;
    adminUser = admProfile!;
    internUser = intProfile!;

    // 2. Initialize authenticated Supabase clients for Employee and Admin
    employeeClient = createClient(supabaseUrl, anonKey);
    const { error: empLoginErr } = await employeeClient.auth.signInWithPassword({
      email: 'employee@scaro.in',
      password: 'Scaro@Employee2026!',
    });
    if (empLoginErr) console.warn('Employee sign-in warning:', empLoginErr.message);

    adminClient = createClient(supabaseUrl, anonKey);
    const { error: admLoginErr } = await adminClient.auth.signInWithPassword({
      email: 'admin@scaro.in',
      password: 'Scaro@Admin2026!',
    });
    if (admLoginErr) console.warn('Admin sign-in warning:', admLoginErr.message);
  });

  test('Case 1: Employee CANNOT self-approve leave (Security Escalation Test)', async () => {
    // 1. Employee submits a legitimate Pending request
    const { data: request, error: insErr } = await employeeClient
      .from('leave_requests')
      .insert({
        user_id: employeeUser.id,
        type: 'Leave',
        start_date: '2026-10-01',
        end_date: '2026-10-02',
        reason: 'Security test pending leave',
      })
      .select()
      .single();

    expect(insErr).toBeNull();
    expect(request.status).toBe('Pending');

    // 2. Employee attempts direct API update setting status = 'Approved'
    const { error: escalateErr } = await employeeClient
      .from('leave_requests')
      .update({
        status: 'Approved',
        reviewed_by: employeeUser.id,
      })
      .eq('id', request.id);

    // MUST FAIL: Trigger or RLS must block unauthorized status transition
    expect(escalateErr).not.toBeNull();

    // 3. Verify status in database remains Pending
    const { data: checkDb } = await adminSupabase
      .from('leave_requests')
      .select('status, reviewed_by')
      .eq('id', request.id)
      .single();

    expect(checkDb?.status).toBe('Pending');
    expect(checkDb?.reviewed_by).toBeNull();

    // Clean up
    await adminSupabase.from('leave_requests').delete().eq('id', request.id);
  });

  test('Case 2: Employee CANNOT spoof reviewer, reviewed_at, or rejection_reason', async () => {
    const { data: req } = await employeeClient
      .from('leave_requests')
      .insert({
        user_id: employeeUser.id,
        type: 'Leave',
        start_date: '2026-10-05',
        end_date: '2026-10-06',
        reason: 'Spoofing test',
      })
      .select()
      .single();

    // Attempt to set reviewed_by and rejection_reason while editing reason
    const { error: spoofErr } = await employeeClient
      .from('leave_requests')
      .update({
        reason: 'Updated reason',
        reviewed_by: employeeUser.id,
        rejection_reason: 'Fabricated rejection note',
      })
      .eq('id', req.id);

    // Database must either reject or sanitize review fields
    const { data: check } = await adminSupabase
      .from('leave_requests')
      .select('reviewed_by, rejection_reason')
      .eq('id', req.id)
      .single();

    expect(check?.reviewed_by).toBeNull();
    expect(check?.rejection_reason).toBeNull();

    await adminSupabase.from('leave_requests').delete().eq('id', req.id);
  });

  test('Case 3: Employee CANNOT modify another user’s leave request', async () => {
    // Admin inserts a leave request for intern
    const { data: internReq } = await adminSupabase
      .from('leave_requests')
      .insert({
        user_id: internUser.id,
        type: 'Permission',
        start_date: '2026-10-10',
        end_date: '2026-10-10',
        reason: 'Intern test leave',
      })
      .select()
      .single();

    // Employee tries to modify intern's request
    const { data: modResult, error: modErr } = await employeeClient
      .from('leave_requests')
      .update({ reason: 'Malicious modification' })
      .eq('id', internReq.id)
      .select();

    // Either errors or returns empty set due to RLS
    expect(modResult?.length || 0).toBe(0);

    const { data: check } = await adminSupabase
      .from('leave_requests')
      .select('reason')
      .eq('id', internReq.id)
      .single();

    expect(check?.reason).toBe('Intern test leave');

    await adminSupabase.from('leave_requests').delete().eq('id', internReq.id);
  });

  test('Case 4: Employee CAN cancel own Pending request (Pending -> Cancelled)', async () => {
    const { data: req } = await employeeClient
      .from('leave_requests')
      .insert({
        user_id: employeeUser.id,
        type: 'Work From Home',
        start_date: '2026-10-15',
        end_date: '2026-10-16',
        reason: 'Will work remotely',
      })
      .select()
      .single();

    expect(req.status).toBe('Pending');

    // Employee cancels request
    const { error: cancelErr } = await employeeClient
      .from('leave_requests')
      .update({ status: 'Cancelled' })
      .eq('id', req.id);

    expect(cancelErr).toBeNull();

    const { data: check } = await adminSupabase
      .from('leave_requests')
      .select('status, reviewed_by')
      .eq('id', req.id)
      .single();

    expect(check?.status).toBe('Cancelled');
    expect(check?.reviewed_by).toBeNull();

    // Employee cannot modify cancelled request (RLS filters out non-pending requests)
    const { data: postCancelData } = await employeeClient
      .from('leave_requests')
      .update({ reason: 'Change mind' })
      .eq('id', req.id)
      .select();

    expect(postCancelData?.length || 0).toBe(0);

    const { data: checkAfter } = await adminSupabase
      .from('leave_requests')
      .select('reason')
      .eq('id', req.id)
      .single();

    expect(checkAfter?.reason).toBe('Will work remotely');

    await adminSupabase.from('leave_requests').delete().eq('id', req.id);
  });

  test('Case 5: Admin CAN approve pending request with automatic reviewer metadata', async () => {
    const { data: req } = await employeeClient
      .from('leave_requests')
      .insert({
        user_id: employeeUser.id,
        type: 'Leave',
        start_date: '2026-10-20',
        end_date: '2026-10-22',
        reason: 'Vacation days',
      })
      .select()
      .single();

    // Admin approves request
    const { error: approveErr } = await adminClient
      .from('leave_requests')
      .update({ status: 'Approved' })
      .eq('id', req.id);

    expect(approveErr).toBeNull();

    const { data: check } = await adminSupabase
      .from('leave_requests')
      .select('status, reviewed_by, reviewed_at, rejection_reason')
      .eq('id', req.id)
      .single();

    expect(check?.status).toBe('Approved');
    expect(check?.reviewed_by).toBe(adminUser.id);
    expect(check?.reviewed_at).not.toBeNull();
    expect(check?.rejection_reason).toBeNull();

    // Cannot transition Approved -> Pending
    const { error: revertErr } = await adminClient
      .from('leave_requests')
      .update({ status: 'Pending' })
      .eq('id', req.id);

    expect(revertErr).not.toBeNull();

    await adminSupabase.from('leave_requests').delete().eq('id', req.id);
  });

  test('Case 6: Admin CAN reject pending request with rejection reason', async () => {
    const { data: req } = await employeeClient
      .from('leave_requests')
      .insert({
        user_id: employeeUser.id,
        type: 'Leave',
        start_date: '2026-10-25',
        end_date: '2026-10-26',
        reason: 'Short notice leave',
      })
      .select()
      .single();

    // Admin rejects with reason
    const { error: rejectErr } = await adminClient
      .from('leave_requests')
      .update({
        status: 'Rejected',
        rejection_reason: 'Project delivery deadline conflicts with requested dates',
      })
      .eq('id', req.id);

    expect(rejectErr).toBeNull();

    const { data: check } = await adminSupabase
      .from('leave_requests')
      .select('status, reviewed_by, reviewed_at, rejection_reason')
      .eq('id', req.id)
      .single();

    expect(check?.status).toBe('Rejected');
    expect(check?.reviewed_by).toBe(adminUser.id);
    expect(check?.reviewed_at).not.toBeNull();
    expect(check?.rejection_reason).toBe('Project delivery deadline conflicts with requested dates');

    // Cannot transition Rejected -> Approved
    const { error: flipErr } = await adminClient
      .from('leave_requests')
      .update({ status: 'Approved' })
      .eq('id', req.id);

    expect(flipErr).not.toBeNull();

    await adminSupabase.from('leave_requests').delete().eq('id', req.id);
  });

  test('Case 7: Audit Logging captures Leave operations', async () => {
    // Check audit_logs for leave_requests table
    const { data: logs, error: logErr } = await adminSupabase
      .from('audit_logs')
      .select('*')
      .eq('table_name', 'leave_requests')
      .order('created_at', { ascending: false })
      .limit(5);

    expect(logErr).toBeNull();
    // Verify trigger logged events into audit_logs
    expect(logs?.length).toBeGreaterThan(0);
    expect(['INSERT', 'UPDATE']).toContain(logs![0].action);
  });

  test('Case 8: Playwright UI End-to-End Workflow', async ({ page }) => {
    // 1. Log in as employee
    await page.goto('/login');
    await page.fill('input[type="email"]', 'employee@scaro.in');
    await page.fill('input[type="password"]', 'Scaro@Employee2026!');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/app/dashboard');

    // 2. Navigate to Leave page via sidebar
    const leaveNav = page.locator('a[href="/app/leave"]');
    await expect(leaveNav).toBeVisible();
    await leaveNav.click();
    await page.waitForURL('**/app/leave');

    // 3. Verify Employee Leave UI elements
    await expect(page.locator('text=Leave & HR Operations')).toBeVisible();
    await expect(page.locator('text=My Leave Applications')).toBeVisible();
    await expect(page.locator('button:has-text("Apply for Leave")')).toBeVisible();

    // 4. Open Application Modal
    await page.click('button:has-text("Apply for Leave")');
    await expect(page.locator('text=Apply for Leave / Time Off')).toBeVisible();

    // 5. Fill form and submit
    const testReason = `Playwright automated test ${Date.now()}`;
    await page.fill('textarea[placeholder*="State reason"]', testReason);
    await page.click('button:has-text("Submit Request")');

    // 6. Verify request appears in list with Pending Review badge
    await expect(page.locator(`p:has-text("${testReason}")`)).toBeVisible({
      timeout: 10000,
    });
    await expect(page.locator('text=Pending Review').first()).toBeVisible();

    // 7. Cancel the request
    const cancelBtn = page.locator('button:has-text("Cancel Request")').first();
    await expect(cancelBtn).toBeVisible();

    page.once('dialog', dialog => dialog.accept());
    await cancelBtn.click();

    // 8. Verify status updates to Cancelled
    await expect(page.locator('text=Cancelled').first()).toBeVisible({ timeout: 10000 });

    // Clean up
    await adminSupabase.from('leave_requests').delete().like('reason', 'Playwright%');
  });

  test('Case 9: Playwright UI Admin Management View & Privacy', async ({ page }) => {
    // 1. Log in as admin
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin@scaro.in');
    await page.fill('input[type="password"]', 'Scaro@Admin2026!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/app\/admin\/(overview|dashboard)/);

    // 2. Navigate to Leave
    await page.goto('/app/leave');
    await page.waitForURL('**/app/leave');

    // 3. Verify Admin management tabs exist
    await expect(page.locator('button:has-text("Pending Action")')).toBeVisible();
    await expect(page.locator('button:has-text("Today\'s On Leave")')).toBeVisible();
    await expect(page.locator('button:has-text("Leave Schedule")')).toBeVisible();
    await expect(page.locator('button:has-text("All Company Records")')).toBeVisible();
    await expect(page.locator('button:has-text("My Own Requests")')).toBeVisible();

    // 4. Click Today's On Leave tab
    await page.click('button:has-text("Today\'s On Leave")');
    await expect(page.locator('text=Today\'s On-Leave Workforce')).toBeVisible();

    // 5. Click Leave Schedule tab
    await page.click('button:has-text("Leave Schedule")');
    await expect(page.locator('text=Approved Leave Schedule (Next 30 Days)')).toBeVisible();
    await expect(
      page.locator('text=Personal notes and private reasons are omitted for privacy.')
    ).toBeVisible();
  });

  test('Case 10: Overlap Detection Tests', async () => {
    // 1. Insert a pending request for employee
    const { data: req1 } = await employeeClient
      .from('leave_requests')
      .insert({
        user_id: employeeUser.id,
        type: 'Leave',
        start_date: '2026-11-10',
        end_date: '2026-11-15',
        reason: 'Base period for overlap test',
      })
      .select()
      .single();

    // 2. Query overlap for exact same period
    const { data: overlap1 } = await employeeClient
      .from('leave_requests')
      .select('id, user_id, start_date, end_date, status')
      .eq('user_id', employeeUser.id)
      .in('status', ['Pending', 'Approved'])
      .lte('start_date', '2026-11-15')
      .gte('end_date', '2026-11-10');

    expect(overlap1?.length).toBe(1);

    // 3. Query overlap for partial overlapping period (2026-11-12 to 2026-11-20)
    const { data: overlap2 } = await employeeClient
      .from('leave_requests')
      .select('id, user_id, start_date, end_date, status')
      .eq('user_id', employeeUser.id)
      .in('status', ['Pending', 'Approved'])
      .lte('start_date', '2026-11-20')
      .gte('end_date', '2026-11-12');

    expect(overlap2?.length).toBe(1);

    // 4. Query for a non-overlapping period (2026-11-16 to 2026-11-20)
    const { data: noOverlap } = await employeeClient
      .from('leave_requests')
      .select('id, user_id, start_date, end_date, status')
      .eq('user_id', employeeUser.id)
      .in('status', ['Pending', 'Approved'])
      .lte('start_date', '2026-11-20')
      .gte('end_date', '2026-11-16');

    expect(noOverlap?.length).toBe(0);

    // 5. Query for different user (intern) during same period -> does not conflict
    const { data: diffUserOverlap } = await employeeClient
      .from('leave_requests')
      .select('id, user_id, start_date, end_date, status')
      .eq('user_id', internUser.id)
      .in('status', ['Pending', 'Approved'])
      .lte('start_date', '2026-11-15')
      .gte('end_date', '2026-11-10');

    expect(diffUserOverlap?.length).toBe(0);

    // Clean up
    await adminSupabase.from('leave_requests').delete().eq('id', req1.id);
  });
});
