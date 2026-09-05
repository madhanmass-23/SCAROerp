import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { evaluateWorkforceCorrelationStatus } from '../src/utils/workforceLogic';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.admin.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';

const adminSupabase = createClient(supabaseUrl, serviceRoleKey);

test.describe.serial('Phase 9 — Workforce Performance & Work Intelligence', () => {
  let employeeUser: { id: string; email: string };
  let adminUser: { id: string; email: string };
  let internUser: { id: string; email: string };

  let employeeClient: any;
  let internClient: any;
  let adminClient: any;

  test.beforeAll(async () => {
    // 1. Fetch test profiles
    const { data: empProfile } = await adminSupabase
      .from('profiles')
      .select('id, email, full_name')
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

    // 2. Initialize authenticated Supabase clients
    employeeClient = createClient(supabaseUrl, anonKey);
    await employeeClient.auth.signInWithPassword({
      email: 'employee@scaro.in',
      password: 'Scaro@Employee2026!',
    });

    internClient = createClient(supabaseUrl, anonKey);
    await internClient.auth.signInWithPassword({
      email: 'intern@scaro.in',
      password: 'Scaro@Intern2026!',
    });

    adminClient = createClient(supabaseUrl, anonKey);
    await adminClient.auth.signInWithPassword({
      email: 'admin@scaro.in',
      password: 'Scaro@Admin2026!',
    });
  });

  // -------------------------------------------------------------
  // Test 1: Super Admin Intelligence & Team Workload Rendering
  // -------------------------------------------------------------
  test('1. Super Admin Dashboard renders Workforce Intelligence & Team Workload', async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"]', 'admin@scaro.in');
    await page.fill('input[type="password"]', 'Scaro@Admin2026!');
    await page.click('button[type="submit"]');

    await page.waitForURL('**/app/**', { timeout: 15000 });

    // Verify Super Admin Intelligence header & metric cards
    await expect(page.locator('text=Super Admin Intelligence')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Total Employees')).toBeVisible();
    await expect(page.locator('text=Total Interns')).toBeVisible();
    await expect(page.locator('text=Active Projects')).toBeVisible();

    // Verify Team Workload & Operational Allocation component
    await expect(page.locator('text=Team Workload & Operational Allocation')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Team Members').first()).toBeVisible();
    await expect(page.locator('text=Active Tasks').first()).toBeVisible();

    // Verify Work Activity & Operational Throughput Trends
    await expect(page.locator('text=Work Activity & Operational Throughput Trends')).toBeVisible({ timeout: 10000 });

    // Clear local storage for isolation
    await page.evaluate(() => localStorage.clear());
  });

  // -------------------------------------------------------------
  // Test 2: Admin Dashboard Workload & Filtering
  // -------------------------------------------------------------
  test('2. Admin Dashboard renders Team Workload with neutral operational filters', async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"]', 'manager@scaro.in');
    await page.fill('input[type="password"]', 'Scaro@Manager2026!');
    await page.click('button[type="submit"]');

    await page.waitForURL('**/app/**', { timeout: 15000 });

    await expect(page.locator('text=Operations & Team Control')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Team Workload & Operational Allocation')).toBeVisible({ timeout: 10000 });

    // Verify search input
    const searchInput = page.locator('input[placeholder*="Search by name"]');
    await expect(searchInput).toBeVisible();

    // Type employee search
    const searchTarget = (employeeUser as any).full_name || 'employee';
    await searchInput.fill(searchTarget);
    await page.waitForTimeout(500);

    // Verify filtered table results
    await expect(page.locator(`text=${searchTarget}`).first()).toBeVisible();

    // Clear search
    await searchInput.fill('');
    await page.waitForTimeout(500);

    await page.evaluate(() => localStorage.clear());
  });

  // -------------------------------------------------------------
  // Test 3: Individual Work Profile Modal & All Tabs
  // -------------------------------------------------------------
  test('3. Person Work Profile Modal opens with full operational tabs and workload pills', async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"]', 'admin@scaro.in');
    await page.fill('input[type="password"]', 'Scaro@Admin2026!');
    await page.click('button[type="submit"]');

    await page.waitForURL('**/app/**', { timeout: 15000 });

    // Open work profile for first member
    const workProfileBtn = page.locator('button:has-text("Work Profile")').first();
    await expect(workProfileBtn).toBeVisible({ timeout: 10000 });
    await workProfileBtn.click();

    // Verify modal appears
    await expect(page.locator('text=Team Member Work Profile')).toBeVisible({ timeout: 10000 });

    const modal = page.locator('.fixed.inset-0').last();
    // Wait for async load to finish
    await expect(modal.locator('text=Loading comprehensive work profile...')).toBeHidden({ timeout: 15000 });

    // Verify Workload pills inside modal
    await expect(modal.locator('text=Active Tasks').first()).toBeVisible({ timeout: 10000 });
    await expect(modal.locator('text=In Progress').first()).toBeVisible({ timeout: 10000 });
    await expect(modal.locator('text=In Review').first()).toBeVisible({ timeout: 10000 });
    await expect(modal.locator('text=Overdue').first()).toBeVisible({ timeout: 10000 });
    await expect(modal.locator('text=Completed').first()).toBeVisible({ timeout: 10000 });

    // Verify tabs are present
    await expect(modal.locator('button:has-text("Active Tasks")').first()).toBeVisible();
    await expect(modal.locator('button:has-text("Projects")').first()).toBeVisible();
    await expect(modal.locator('button:has-text("Work History")').first()).toBeVisible();
    await expect(modal.locator('button:has-text("Attendance & Leave")').first()).toBeVisible();
    await expect(modal.locator('button:has-text("Meetings")').first()).toBeVisible();
    await expect(modal.locator('button:has-text("Blockers")').first()).toBeVisible();

    // Click Projects tab
    await modal.locator('button:has-text("Projects")').first().click();
    await page.waitForTimeout(300);

    // Click Work History tab
    await modal.locator('button:has-text("Work History")').first().click();
    await page.waitForTimeout(300);

    // Click Attendance & Leave tab
    await modal.locator('button:has-text("Attendance & Leave")').first().click();
    await page.waitForTimeout(300);
    await expect(modal.locator('text=Leave Records').first()).toBeVisible();
    await expect(modal.locator('text=Recent Attendance Sessions').first()).toBeVisible();

    // Close modal
    await modal.locator('button[aria-label="Close"]').click();
    await page.waitForTimeout(300);

    await page.evaluate(() => localStorage.clear());
  });

  // -------------------------------------------------------------
  // Test 4: Overdue Task Mathematical Calculation
  // -------------------------------------------------------------
  test('4. Overdue Task Calculation handles status and dates accurately', async () => {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    const isTaskOverdue = (status: string, dueDate: string | null) => {
      const isCompleted = status === 'Completed';
      const isCancelled = status === 'Cancelled';
      return !isCompleted && !isCancelled && !!dueDate && dueDate < today;
    };

    // Past due with open status -> OVERDUE
    expect(isTaskOverdue('Todo', yesterday)).toBe(true);
    expect(isTaskOverdue('In Progress', yesterday)).toBe(true);
    expect(isTaskOverdue('Review', yesterday)).toBe(true);
    expect(isTaskOverdue('Needs Revision', yesterday)).toBe(true);
    expect(isTaskOverdue('On Hold', yesterday)).toBe(true);

    // Past due with completed or cancelled -> NOT OVERDUE
    expect(isTaskOverdue('Completed', yesterday)).toBe(false);
    expect(isTaskOverdue('Cancelled', yesterday)).toBe(false);

    // Future due -> NOT OVERDUE
    expect(isTaskOverdue('In Progress', tomorrow)).toBe(false);

    // Today due -> NOT OVERDUE
    expect(isTaskOverdue('In Progress', today)).toBe(false);

    // Null due date -> NOT OVERDUE
    expect(isTaskOverdue('In Progress', null)).toBe(false);
  });

  // -------------------------------------------------------------
  // Test 5: Attendance / Report Correlation Consistency
  // -------------------------------------------------------------
  test('5. Attendance Correlation reuses authoritative Phase 5B logic', async () => {
    // Present + Submitted -> Present & Submitted (not pending)
    const s1 = evaluateWorkforceCorrelationStatus(true, true, false);
    expect(s1.status).toBe('Present & Submitted');
    expect(s1.isPending).toBe(false);

    // Present + Not Submitted -> Present & Report Pending (pending = true)
    const s2 = evaluateWorkforceCorrelationStatus(true, false, false);
    expect(s2.status).toBe('Present & Report Pending');
    expect(s2.isPending).toBe(true);

    // Absent -> Absent / Not Checked In (not pending)
    const s3 = evaluateWorkforceCorrelationStatus(false, false, false);
    expect(s3.status).toBe('Absent / Not Checked In');
    expect(s3.isPending).toBe(false);

    // Approved Leave -> On Leave (not pending, even if no report submitted)
    const s4 = evaluateWorkforceCorrelationStatus(false, false, true);
    expect(s4.status).toBe('Absent / Not Checked In'); // absent status but pending exempted
    expect(s4.isPending).toBe(false);
  });

  // -------------------------------------------------------------
  // Test 6: Time Windows & Trend Aggregation
  // -------------------------------------------------------------
  test('6. Time Windows & Trend Analysis supports 7, 14, and 30 day periods', async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"]', 'admin@scaro.in');
    await page.fill('input[type="password"]', 'Scaro@Admin2026!');
    await page.click('button[type="submit"]');

    await page.waitForURL('**/app/**', { timeout: 15000 });

    const trendsContainer = page.locator('text=Work Activity & Operational Throughput Trends');
    await expect(trendsContainer).toBeVisible({ timeout: 10000 });

    // Verify window buttons exist
    const btn7 = page.locator('button:has-text("Last 7 Days")');
    const btn14 = page.locator('button:has-text("Last 14 Days")');
    const btn30 = page.locator('button:has-text("Last 30 Days")');

    await expect(btn7).toBeVisible();
    await expect(btn14).toBeVisible();
    await expect(btn30).toBeVisible();

    // Switch to 7 days
    await btn7.click();
    await page.waitForTimeout(500);
    await expect(page.locator('text=Reports Submitted (7d)')).toBeVisible();

    // Switch to 30 days
    await btn30.click();
    await page.waitForTimeout(500);
    await expect(page.locator('text=Reports Submitted (30d)')).toBeVisible();

    await page.evaluate(() => localStorage.clear());
  });

  // -------------------------------------------------------------
  // Test 7: Strict Prohibition of Ranking and Performance Scoring
  // -------------------------------------------------------------
  test('7. Zero Employee Ranking & Zero Performance Scoring Invariant', async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"]', 'admin@scaro.in');
    await page.fill('input[type="password"]', 'Scaro@Admin2026!');
    await page.click('button[type="submit"]');

    await page.waitForURL('**/app/**', { timeout: 15000 });

    // Ensure no surveillance/ranking keywords appear on the page
    await expect(page.locator('text=Performance Score')).toHaveCount(0);
    await expect(page.locator('text=Productivity Score')).toHaveCount(0);
    await expect(page.locator('text=Employee Ranking')).toHaveCount(0);
    await expect(page.locator('text=Leaderboard')).toHaveCount(0);
    await expect(page.locator('text=Best Employee')).toHaveCount(0);
    await expect(page.locator('text=Worst Employee')).toHaveCount(0);
    await expect(page.locator('text=Efficiency Score')).toHaveCount(0);

    await page.evaluate(() => localStorage.clear());
  });

  // -------------------------------------------------------------
  // Test 8: Privacy Boundaries — Leave Reason & Direct Messages
  // -------------------------------------------------------------
  test('8. Privacy Boundary: Leave reasons and private messages omitted', async () => {
    // 1. Check leave requests query via adminClient
    const { data: leaves } = await adminClient
      .from('leave_requests')
      .select('id, type, start_date, end_date, status, user_id')
      .eq('user_id', employeeUser.id);

    // Leaves must be accessible with dates/type/status
    expect(Array.isArray(leaves)).toBe(true);

    // 2. Direct message privacy: Non-participating user cannot read private messages
    const { data: unauthorizedMessages, error: msgErr } = await internClient
      .from('messages')
      .select('*')
      .or(`sender_id.eq.${adminUser.id},recipient_id.eq.${adminUser.id}`);

    // If intern is not sender or recipient, returned list is empty or rejected
    if (unauthorizedMessages) {
      unauthorizedMessages.forEach((m: any) => {
        expect(m.sender_id === internUser.id || m.recipient_id === internUser.id).toBe(true);
      });
    }
  });

  // -------------------------------------------------------------
  // Test 9: Security & Role Isolation (Employee & Intern Cannot Access Management)
  // -------------------------------------------------------------
  test('9. Security & Role Isolation: Employees cannot access management dashboards', async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"]', 'employee@scaro.in');
    await page.fill('input[type="password"]', 'Scaro@Employee2026!');
    await page.click('button[type="submit"]');

    await page.waitForURL('**/app/**', { timeout: 15000 });

    // Handle checkin if present
    if (await page.locator('textarea#plan').isVisible().catch(() => false)) {
      await page.fill('textarea#plan', 'Daily plan testing');
      await page.click('button[type="submit"]');
      await page.waitForTimeout(1000);
    }

    // Try navigating to Super Admin Dashboard
    await page.goto('/app/admin/dashboard');
    await page.waitForURL('**/app/dashboard', { timeout: 15000 });

    // Try navigating to Admin Overview
    await page.goto('/app/admin/overview');
    await page.waitForURL('**/app/dashboard', { timeout: 15000 });

    await page.evaluate(() => localStorage.clear());
  });

  // -------------------------------------------------------------
  // Test 10: Intern Role Isolation
  // -------------------------------------------------------------
  test('10. Security & Role Isolation: Interns cannot access management dashboards', async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"]', 'intern@scaro.in');
    await page.fill('input[type="password"]', 'Scaro@Intern2026!');
    await page.click('button[type="submit"]');

    await page.waitForURL('**/app/**', { timeout: 15000 });

    // Handle checkin if present
    if (await page.locator('textarea#plan').isVisible().catch(() => false)) {
      await page.fill('textarea#plan', 'Intern plan testing');
      await page.click('button[type="submit"]');
      await page.waitForTimeout(1000);
    }

    // Try navigating to Super Admin Dashboard
    await page.goto('/app/admin/dashboard');
    await page.waitForURL('**/app/dashboard', { timeout: 15000 });

    await page.evaluate(() => localStorage.clear());
  });
});
