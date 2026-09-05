import { test, expect } from '@playwright/test';

const USERS = {
  superAdmin: {
    email: 'satishkumar@scaro.in',
    pass: 'Scaro@SatishKumar2026!',
    role: 'Super Admin',
    dashboard: '/app/admin/dashboard'
  },
  admin: {
    email: 'kumar@scaro.in',
    pass: 'Scaro@Kumar2026!',
    role: 'Admin',
    dashboard: '/app/admin/overview'
  },
  employee: {
    email: 'madhan@scaro.in',
    pass: 'Scaro@Madhan2026!',
    role: 'Employee',
    dashboard: '/app/dashboard'
  },
  intern: {
    email: 'nikitha@scaro.in',
    pass: 'Scaro@Nikitha2026!',
    role: 'Intern',
    dashboard: '/app/intern/dashboard'
  }
};

async function dismissDailyCheckinIfPresent(page: any) {
  try {
    const planTextarea = page.locator('textarea#plan');
    if (await planTextarea.isVisible({ timeout: 2000 }).catch(() => false)) {
      await planTextarea.fill('Working on daily assigned tasks and operational updates.');
      await page.click('button[type="submit"]:has-text("Submit Plan & Clock In")');
      const proceedBtn = page.locator('button:has-text("Proceed to Dashboard")');
      if (await proceedBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await proceedBtn.click();
      }
      await page.waitForLoadState('networkidle');
    }
  } catch {}
}

async function loginUser(page: any, user: { email: string; pass: string }) {
  await page.context().clearCookies();
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  }).catch(() => {});

  await page.goto('/login');
  await page.waitForLoadState('networkidle');
  const emailInput = page.locator('input[type="email"]');
  await emailInput.waitFor({ state: 'visible', timeout: 10000 });
  await emailInput.fill(user.email);
  await page.fill('input[type="password"]', user.pass);
  await page.click('button[type="submit"]');
  await page.waitForURL((url: any) => url.pathname.includes('/app'), { timeout: 20000 });
  await page.waitForLoadState('networkidle');
  await dismissDailyCheckinIfPresent(page);
}

test.describe('SCARO ERP — Step 1C: SPA Deep-Link, Refresh, & Route Protection Verification', () => {
  test.setTimeout(180000);

  test('Unauthenticated deep-link directly redirects to /login', async ({ page }) => {
    // 1. Direct navigate to /app/tasks without auth
    await page.goto('/app/tasks');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
    await expect(page.locator('h1:has-text("SCARO ERP")')).toBeVisible();

    // 2. Direct navigate to /app/messages without auth
    await page.goto('/app/messages');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });

    // 3. Direct navigate to /app/admin/dashboard without auth
    await page.goto('/app/admin/dashboard');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
  });

  test('Direct deep-link navigation and hard refresh across primary application routes for Admin', async ({ page }) => {
    await loginUser(page, USERS.admin);

    const routes = [
      { path: '/app/admin/overview', headerSubstring: 'Operations & Team Control' },
      { path: '/app/tasks', headerSubstring: 'Task Management' },
      { path: '/app/projects', headerSubstring: 'Projects' },
      { path: '/app/attendance', headerSubstring: 'Attendance' },
      { path: '/app/meetings', headerSubstring: 'Meetings' },
      { path: '/app/reports', headerSubstring: 'Daily Reports' },
      { path: '/app/messages', headerSubstring: 'Direct Messages' },
      { path: '/app/notifications', headerSubstring: 'Notifications' },
      { path: '/app/leave', headerSubstring: 'Leave' },
      { path: '/app/profile', headerSubstring: 'User Profile' },
      { path: '/app/people', headerSubstring: 'People' }
    ];

    for (const route of routes) {
      // Direct deep-link navigation
      await page.goto(route.path);
      await page.waitForLoadState('networkidle');
      await dismissDailyCheckinIfPresent(page);

      // Verify page content loads via h1
      await expect(page.locator('h1').first()).toContainText(route.headerSubstring, { timeout: 10000 });

      // Test hard browser refresh on the route
      await page.reload();
      await page.waitForLoadState('networkidle');
      await dismissDailyCheckinIfPresent(page);
      await expect(page.locator('h1').first()).toContainText(route.headerSubstring, { timeout: 10000 });
    }
  });

  test('Direct deep-link navigation and hard refresh across Employee routes', async ({ page }) => {
    await loginUser(page, USERS.employee);

    const routes = [
      { path: '/app/dashboard', headerSubstring: 'Welcome back' },
      { path: '/app/tasks', headerSubstring: 'Task Management' },
      { path: '/app/projects', headerSubstring: 'Projects' },
      { path: '/app/attendance', headerSubstring: 'Attendance' },
      { path: '/app/meetings', headerSubstring: 'Meetings' },
      { path: '/app/tracker', headerSubstring: 'Daily Work Tracker' },
      { path: '/app/messages', headerSubstring: 'Direct Messages' },
      { path: '/app/notifications', headerSubstring: 'Notifications' },
      { path: '/app/leave', headerSubstring: 'Leave' },
      { path: '/app/profile', headerSubstring: 'User Profile' }
    ];

    for (const route of routes) {
      await page.goto(route.path);
      await page.waitForLoadState('networkidle');
      await dismissDailyCheckinIfPresent(page);

      await expect(page.locator('h1').first()).toContainText(route.headerSubstring, { timeout: 10000 });

      // Hard refresh test
      await page.reload();
      await page.waitForLoadState('networkidle');
      await dismissDailyCheckinIfPresent(page);
      await expect(page.locator('h1').first()).toContainText(route.headerSubstring, { timeout: 10000 });
    }
  });

  test('Direct deep-link navigation and hard refresh for Intern Dashboard', async ({ page }) => {
    await loginUser(page, USERS.intern);

    await page.goto('/app/intern/dashboard');
    await page.waitForLoadState('networkidle');
    await dismissDailyCheckinIfPresent(page);

    await expect(page.locator('h1:has-text("Intern Training Hub")')).toBeVisible({ timeout: 15000 });

    // Hard refresh test
    await page.reload();
    await page.waitForLoadState('networkidle');
    await dismissDailyCheckinIfPresent(page);
    await expect(page.locator('h1:has-text("Intern Training Hub")')).toBeVisible({ timeout: 15000 });
  });

  test('RBAC Deep-Link Protection: Employee unauthorized routes redirect to authorized dashboard', async ({ page }) => {
    await loginUser(page, USERS.employee);

    // 1. Employee attempting to navigate directly to Super Admin dashboard
    await page.goto('/app/admin/dashboard');
    await page.waitForLoadState('networkidle');
    await dismissDailyCheckinIfPresent(page);
    await expect(page).toHaveURL(/\/app\/dashboard/);

    // 2. Employee attempting to navigate directly to Admin Overview
    await page.goto('/app/admin/overview');
    await page.waitForLoadState('networkidle');
    await dismissDailyCheckinIfPresent(page);
    await expect(page).toHaveURL(/\/app\/dashboard/);

    // 3. Employee attempting to navigate directly to Audit Logs
    await page.goto('/app/audit-logs');
    await page.waitForLoadState('networkidle');
    await dismissDailyCheckinIfPresent(page);
    await expect(page).toHaveURL(/\/app\/dashboard/);
  });

  test('Invalid Routes: Render 404 Page Not Found correctly', async ({ page }) => {
    await loginUser(page, USERS.employee);

    // 1. App sub-route invalid path
    await page.goto('/app/non-existent-module');
    await page.waitForLoadState('networkidle');
    await dismissDailyCheckinIfPresent(page);
    await expect(page.locator('h1:has-text("404")')).toBeVisible();
    await expect(page.locator('h2:has-text("Page Not Found")')).toBeVisible();

    // 2. Global invalid path
    await page.goto('/completely-unknown-route');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1:has-text("404")')).toBeVisible();
    await expect(page.locator('h2:has-text("Page Not Found")')).toBeVisible();

    // 3. Click "Return to Dashboard"
    await page.click('a[href="/app/dashboard"] button, button:has-text("Return to Dashboard")');
    await page.waitForLoadState('networkidle');
    await dismissDailyCheckinIfPresent(page);
    await expect(page).toHaveURL(/\/app\/dashboard/);
  });
});
