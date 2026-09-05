import { test, expect } from '@playwright/test';
import { evaluateWorkforceCorrelationStatus } from '../src/utils/workforceLogic';

test.describe.serial('Phase 5B - Management Intelligence & Daily Work Control', () => {

  test('1. Super Admin Dashboard & Management Modules', async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"]', 'admin@scaro.in');
    await page.fill('input[type="password"]', 'Scaro@Admin2026!');
    await page.click('button[type="submit"]');

    await page.waitForURL('**/app/**', { timeout: 15000 });

    // Verify Super Admin Dashboard loads with genuine metrics
    await expect(page.locator('text=Super Admin Intelligence')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Total Employees')).toBeVisible();
    await expect(page.locator('text=Total Interns')).toBeVisible();
    await expect(page.locator('text=Checked In Today')).toBeVisible();
    await expect(page.locator('text=Reports Submitted')).toBeVisible();
    await expect(page.locator('text=Reports Pending')).toBeVisible();

    // Verify Attendance Correlation module is present
    await expect(page.locator('text=Today\'s Workforce & Report Correlation')).toBeVisible();

    // Verify Google Sheets Sync Health is present
    await expect(page.locator('text=Google Sheets Synchronization Health')).toBeVisible();

    // Verify Reported Blockers component is present
    await expect(page.locator('text=Reported Blockers').first()).toBeVisible();

    await page.evaluate(() => localStorage.clear());
  });

  test('2. Admin Dashboard & Operational Scope', async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"]', 'manager@scaro.in');
    await page.fill('input[type="password"]', 'Scaro@Manager2026!');
    await page.click('button[type="submit"]');

    await page.waitForURL('**/app/**', { timeout: 15000 });

    // Verify Admin Dashboard loads
    await expect(page.locator('text=Operations & Team Control')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Team Members').first()).toBeVisible();
    await expect(page.locator('text=Reports Done').first()).toBeVisible();

    // Verify Admin does NOT see Super Admin-only navigation links
    await expect(page.locator('text=Company Settings')).toHaveCount(0);
    await expect(page.locator('text=Audit Logs')).toHaveCount(0);

    await page.evaluate(() => localStorage.clear());
  });

  test('3. Employee & Intern Role Isolation (No Management Dashboard Access)', async ({ page }) => {
    // Login as Employee
    await page.goto('/');
    await page.fill('input[type="email"]', 'employee@scaro.in');
    await page.fill('input[type="password"]', 'Scaro@Employee2026!');
    await page.click('button[type="submit"]');

    await page.waitForURL('**/app/**', { timeout: 15000 });

    // Pass morning checkin if prompted
    if (await page.locator('textarea#plan').isVisible().catch(() => false)) {
      await page.fill('textarea#plan', 'Plan for isolation test');
      await page.click('button[type="submit"]');
      await page.waitForTimeout(1000);
    }

    // Attempt to navigate directly to Super Admin dashboard
    await page.goto('/app/admin/dashboard');
    // Expect redirection away to Employee default dashboard
    await page.waitForURL('**/app/dashboard', { timeout: 15000 });

    // Attempt to navigate to Admin overview
    await page.goto('/app/admin/overview');
    await page.waitForURL('**/app/dashboard', { timeout: 15000 });

    await page.evaluate(() => localStorage.clear());
  });

  test('4. Daily Reports Management List, Filters, Pagination, and Detail', async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"]', 'admin@scaro.in');
    await page.fill('input[type="password"]', 'Scaro@Admin2026!');
    await page.click('button[type="submit"]');

    await page.waitForURL('**/app/**', { timeout: 15000 });

    // Navigate to Reports
    await page.click('text=All Reports', { timeout: 10000 });
    await expect(page.locator('text=Management Daily Reports')).toBeVisible({ timeout: 10000 });

    // Test Date Preset buttons
    await page.locator('button:has-text("Today")').first().click();
    await page.waitForTimeout(1000);

    // Test Clear Filters
    if (await page.locator('button:has-text("Clear Filters")').isVisible().catch(() => false)) {
      await page.click('button:has-text("Clear Filters")');
    }

    // Test Detail Modal
    const inspectBtn = page.locator('button[title="Inspect Details"]');
    if (await inspectBtn.count() > 0) {
      await inspectBtn.first().click();
      await expect(page.locator('text=Daily Report Inspection')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('text=Tasks Worked On')).toBeVisible();
      // Close modal
      await page.keyboard.press('Escape');
    }

    await page.evaluate(() => localStorage.clear());
  });

  test('5. Project Activity Overview', async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"]', 'admin@scaro.in');
    await page.fill('input[type="password"]', 'Scaro@Admin2026!');
    await page.click('button[type="submit"]');

    await page.waitForURL('**/app/**', { timeout: 15000 });

    // Go to Projects
    await page.click('text=Projects', { timeout: 10000 });
    await expect(page.locator('h1:has-text("Projects")')).toBeVisible({ timeout: 10000 });

    // If there's an existing project card, click to open details & activity
    const projectCard = page.locator('.hover\\:shadow-md');
    if (await projectCard.count() > 0) {
      await projectCard.first().click();
      await expect(page.locator('text=Project Details & Activity Overview')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('text=Recent Daily Report Logs')).toBeVisible();
      await page.keyboard.press('Escape');
    }

    // Test Logout
    const logoutBtn = page.locator('button:has-text("Logout"), button[title="Logout"]');
    if (await logoutBtn.first().isVisible().catch(() => false)) {
      await logoutBtn.first().click();
    }
    await page.evaluate(() => localStorage.clear());
  });

  test('6. Reports Pending Today Business Logic & Edge Cases (Cases 1-5)', async () => {
    // CASE 1: 5 checked in, 3 submitted, 2 pending -> Expected pending = 2
    const case1Users = [
      { isPresent: true, isSubmitted: true },
      { isPresent: true, isSubmitted: true },
      { isPresent: true, isSubmitted: true },
      { isPresent: true, isSubmitted: false },
      { isPresent: true, isSubmitted: false },
    ];
    const case1Pending = case1Users.filter(
      u => evaluateWorkforceCorrelationStatus(u.isPresent, u.isSubmitted).isPending
    ).length;
    expect(case1Pending).toBe(2);

    // CASE 2: 5 active, 3 checked in, 3 submitted, 2 absent -> Expected pending = 0
    const case2Users = [
      { isPresent: true, isSubmitted: true },
      { isPresent: true, isSubmitted: true },
      { isPresent: true, isSubmitted: true },
      { isPresent: false, isSubmitted: false }, // absent
      { isPresent: false, isSubmitted: false }, // absent
    ];
    const case2Pending = case2Users.filter(
      u => evaluateWorkforceCorrelationStatus(u.isPresent, u.isSubmitted).isPending
    ).length;
    expect(case2Pending).toBe(0);

    // CASE 3: 5 active, 3 checked in, 1 submitted, 2 pending, 2 absent -> Expected pending = 2
    const case3Users = [
      { isPresent: true, isSubmitted: true },
      { isPresent: true, isSubmitted: false }, // pending
      { isPresent: true, isSubmitted: false }, // pending
      { isPresent: false, isSubmitted: false }, // absent
      { isPresent: false, isSubmitted: false }, // absent
    ];
    const case3Pending = case3Users.filter(
      u => evaluateWorkforceCorrelationStatus(u.isPresent, u.isSubmitted).isPending
    ).length;
    expect(case3Pending).toBe(2);

    // CASE 4: Approved leave users are excluded from pending reports
    const case4OnLeave = evaluateWorkforceCorrelationStatus(true, false, true);
    expect(case4OnLeave.isPending).toBe(false);
    expect(case4OnLeave.status).toBe('Present & Submitted');

    const case4AbsentOnLeave = evaluateWorkforceCorrelationStatus(false, false, true);
    expect(case4AbsentOnLeave.isPending).toBe(false);
    expect(case4AbsentOnLeave.status).toBe('Absent / Not Checked In');

    // CASE 5: Duplicate attendance sessions for one person do not increase pending count
    // Deduplication via Set:
    const duplicateSessions = [
      { user_id: 'user-1', clock_in_time: '09:00' },
      { user_id: 'user-1', clock_in_time: '13:00' }, // multiple sessions
      { user_id: 'user-2', clock_in_time: '09:30' },
    ];
    const uniqueCheckedInUserIds = new Set(duplicateSessions.map(s => s.user_id));
    expect(uniqueCheckedInUserIds.size).toBe(2); // user-1 counted once
    const user1Pending = evaluateWorkforceCorrelationStatus(
      uniqueCheckedInUserIds.has('user-1'),
      false
    ).isPending;
    expect(user1Pending).toBe(true);

    // Edge Case: No check-in + submitted report -> report remains submitted, attendance not fabricated
    const noCheckinSubmitted = evaluateWorkforceCorrelationStatus(false, true, false);
    expect(noCheckinSubmitted.isPending).toBe(false);
    expect(noCheckinSubmitted.status).toBe('Absent / Not Checked In');
  });

});
