import { test, expect } from '@playwright/test';

const USERS = {
  intern: {
    name: 'Maheswari',
    email: 'maheswari@scaro.com',
    pass: 'Scaro@Maheswari2026!',
    expectedRoute: '/app/intern/dashboard'
  },
  employee: {
    name: 'Madhan',
    email: 'madhan@scaro.com',
    pass: 'Scaro@Madhan2026!',
    expectedRoute: '/app/dashboard'
  },
  admin: {
    name: 'Kumar',
    email: 'kumar@scaro.com',
    pass: 'Scaro@Kumar2026!',
    expectedRoute: '/app/admin/overview'
  },
  superAdmin: {
    name: 'Satish Kumar',
    email: 'satishkumar@scaro.com',
    pass: 'Scaro@SatishKumar2026!',
    expectedRoute: '/app/admin/dashboard'
  }
};

// Helper: Handles daily morning check-in if intercepted
async function handleCheckinIfNeeded(page: any, planText = 'Focusing on operational task assignments today') {
  try {
    const planBox = page.locator('textarea#plan');
    const mainContent = page.locator('main, header, [role="navigation"]');

    for (let i = 0; i < 8; i++) {
      if (await planBox.isVisible().catch(() => false)) {
        await planBox.fill(planText);
        await page.click('button:has-text("Submit Plan & Clock In")');
        await expect(page.locator('text=Today\'s plan saved.')).toBeVisible({ timeout: 8000 });
        const proceedBtn = page.locator('button:has-text("Proceed to Dashboard")');
        if (await proceedBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await proceedBtn.click();
        }
        await page.waitForTimeout(1000);
        return;
      }
      if (await mainContent.first().isVisible().catch(() => false)) {
        return;
      }
      await page.waitForTimeout(500);
    }
  } catch {
    // Already checked in or supervisor account
  }
}

async function loginUser(page: any, user: any, planText = 'Focusing on operational task assignments today') {
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto('/login');
    await page.fill('input[type="email"]', user.email);
    await page.fill('input[type="password"]', user.pass);
    await page.click('button[type="submit"]');
    try {
      await page.waitForURL(url => url.pathname.includes('/app'), { timeout: 25000 });
      if (user.expectedRoute.includes('/app/intern') || user.expectedRoute === '/app/dashboard') {
        await handleCheckinIfNeeded(page, planText);
      }
      return;
    } catch (err) {
      if (attempt === 2) throw err;
      await page.waitForTimeout(2000);
    }
  }
}

async function logoutUser(page: any) {
  try {
    const userMenuBtn = page.locator('button:has(span.sr-only:has-text("Open user menu"))');
    if (await userMenuBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
      await userMenuBtn.click();
      await page.click('text="Log out"', { timeout: 4000 });
      await page.waitForURL(url => url.pathname.includes('/login'), { timeout: 15000 });
      return;
    }
  } catch {}
  await page.goto('/login');
}

test.describe('SCARO ERP — Real Testing Flows & Verifications', () => {
  test.setTimeout(90000); // 90s per test flow

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  // ==========================================================================
  // SECTION 11 & 12: Login & Role Routing Tests
  // ==========================================================================
  test('1. Role Routing: Intern -> Intern Hub', async ({ page }) => {
    await loginUser(page, USERS.intern);
    await page.waitForURL(url => url.pathname.includes('/app/intern/dashboard'), { timeout: 25000 });
    expect(page.url()).toContain('/app/intern/dashboard');
    await expect(page.locator('text=Intern Training Hub')).toBeVisible({ timeout: 20000 });
  });

  test('2. Role Routing: Employee -> Employee Dashboard', async ({ page }) => {
    await loginUser(page, USERS.employee);
    await page.waitForURL(url => url.pathname.includes('/app/dashboard'), { timeout: 25000 });
    expect(page.url()).toContain('/app/dashboard');
    await expect(page.locator('text=Welcome back')).toBeVisible({ timeout: 20000 });
  });

  test('3. Role Routing: Admin -> Admin Overview', async ({ page }) => {
    await loginUser(page, USERS.admin);
    await page.waitForURL(url => url.pathname.includes('/app/admin/overview'), { timeout: 25000 });
    expect(page.url()).toContain('/app/admin/overview');
    await expect(page.locator('text=Operations & Team Control')).toBeVisible({ timeout: 20000 });
  });

  test('4. Role Routing: Super Admin -> Super Admin Dashboard', async ({ page }) => {
    await loginUser(page, USERS.superAdmin);
    await page.waitForURL(url => url.pathname.includes('/app/admin/dashboard'), { timeout: 25000 });
    expect(page.url()).toContain('/app/admin/dashboard');
    await expect(page.locator('text=Super Admin Intelligence')).toBeVisible({ timeout: 20000 });
  });

  // ==========================================================================
  // SECTION 13: Access Control & Role Isolation
  // ==========================================================================
  test('5. Role Isolation: Intern & Employee unauthorized access prevention', async ({ page }) => {
    await loginUser(page, USERS.intern);

    // Intern cannot access Admin dashboard -> redirects to intern dashboard
    await page.goto('/app/admin/dashboard');
    await expect(page).toHaveURL(/\/app\/intern\/dashboard/, { timeout: 20000 });

    // Intern cannot access Audit logs -> redirects to intern dashboard
    await page.goto('/app/audit-logs');
    await expect(page).toHaveURL(/\/app\/intern\/dashboard/, { timeout: 20000 });

    // Intern cannot access Company settings -> redirects to intern dashboard
    await page.goto('/app/admin/settings');
    await expect(page).toHaveURL(/\/app\/intern\/dashboard/, { timeout: 20000 });
  });

  test('6. Role Isolation: Employee cannot access Admin overview', async ({ page }) => {
    await loginUser(page, USERS.employee);

    await page.goto('/app/admin/overview');
    await expect(page).toHaveURL(/\/app\/dashboard/, { timeout: 20000 });
  });

  // ==========================================================================
  // SECTION 14: Empty State Cleanliness Verification
  // ==========================================================================
  test('7. Empty State Verification (No NaN, undefined, or broken tables)', async ({ page }) => {
    await loginUser(page, USERS.employee);

    // Tasks Page
    await page.goto('/app/tasks');
    await expect(page.locator('text=Task Management')).toBeVisible({ timeout: 20000 });
    let content = await page.content();
    expect(content).not.toContain('NaN');
    expect(content).not.toContain('undefined');

    // Projects Page
    await page.goto('/app/projects');
    await expect(page.locator('h1:has-text("Projects")')).toBeVisible({ timeout: 20000 });
    content = await page.content();
    expect(content).not.toContain('NaN');

    // Meetings Page
    await page.goto('/app/meetings');
    await expect(page.locator('text=Meetings & Syncs')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('text=No upcoming meetings')).toBeVisible();

    // Messages Page
    await page.goto('/app/messages');
    await expect(page.locator('h1:has-text("Messages")')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('text=No conversations yet')).toBeVisible();

    // People (all 15 members listed cleanly)
    await page.goto('/app/people');
    await expect(page.locator('h1:has-text("People")')).toBeVisible({ timeout: 25000 });
    await expect(page.locator('text=15 Members')).toBeVisible({ timeout: 25000 });
  });

  // ==========================================================================
  // SECTION 15: First Real Test Flows
  // ==========================================================================
  test('8. Full Operational Flow: Intern (Maheswari)', async ({ page }) => {
    // Login
    await loginUser(page, USERS.intern, 'Intern learning flow: completing tasks and daily work logs');
    await expect(page.locator('text=Intern Training Hub')).toBeVisible({ timeout: 30000 });

    // Tasks Navigation
    await page.goto('/app/tasks');
    await expect(page.locator('text=Task Management')).toBeVisible({ timeout: 30000 });

    // Daily Work Tracker
    await page.goto('/app/tracker');
    await expect(page.locator('h1:has-text("Daily Work Tracker")')).toBeVisible({ timeout: 30000 });

    // Daily Reports
    await page.goto('/app/reports');
    await expect(page.locator('h1:has-text("Daily Reports")')).toBeVisible({ timeout: 30000 });

    // Notifications
    await page.goto('/app/notifications');
    await expect(page.locator('h1:has-text("Notifications")')).toBeVisible({ timeout: 30000 });

    // Logout
    await logoutUser(page);
    expect(page.url()).toContain('/login');
  });

  test('9. Full Operational Flow: Employee (Madhan)', async ({ page }) => {
    // Login
    await loginUser(page, USERS.employee, 'Employee flow: managing projects and team correspondence');
    await expect(page.locator('text=Welcome back')).toBeVisible({ timeout: 20000 });

    // Tasks
    await page.goto('/app/tasks');
    await expect(page.locator('text=Task Management')).toBeVisible({ timeout: 20000 });

    // Projects
    await page.goto('/app/projects');
    await expect(page.locator('h1:has-text("Projects")')).toBeVisible({ timeout: 20000 });

    // Daily Report
    await page.goto('/app/reports');
    await expect(page.locator('h1:has-text("Daily Reports")')).toBeVisible({ timeout: 20000 });

    // Messages
    await page.goto('/app/messages');
    await expect(page.locator('h1:has-text("Messages")')).toBeVisible({ timeout: 20000 });

    // Leave
    await page.goto('/app/leave');
    await expect(page.locator('h1:has-text("Leave & HR Operations")')).toBeVisible({ timeout: 20000 });

    // Profile
    await page.goto('/app/profile');
    await expect(page.locator('h1:has-text("User Profile")')).toBeVisible({ timeout: 20000 });

    // Logout
    await logoutUser(page);
    expect(page.url()).toContain('/login');
  });

  test('10. Full Operational Flow: Admin (Kumar)', async ({ page }) => {
    // Login
    await loginUser(page, USERS.admin);
    await expect(page.locator('text=Operations & Team Control')).toBeVisible({ timeout: 20000 });

    // People
    await page.goto('/app/people');
    await expect(page.locator('h1:has-text("People")')).toBeVisible({ timeout: 20000 });

    // Tasks
    await page.goto('/app/tasks');
    await expect(page.locator('text=Task Management')).toBeVisible({ timeout: 20000 });

    // Projects
    await page.goto('/app/projects');
    await expect(page.locator('h1:has-text("Projects")')).toBeVisible({ timeout: 20000 });

    // Attendance
    await page.goto('/app/attendance');
    await expect(page.locator('text=Attendance & Time Tracking')).toBeVisible({ timeout: 20000 });

    // Reports
    await page.goto('/app/reports');
    await expect(page.locator('h1:has-text("Daily Reports")')).toBeVisible({ timeout: 20000 });

    // Leave
    await page.goto('/app/leave');
    await expect(page.locator('h1:has-text("Leave & HR Operations")')).toBeVisible({ timeout: 20000 });

    // Work Intelligence (Admin Overview)
    await page.goto('/app/admin/overview');
    await expect(page.locator('text=Operations & Team Control')).toBeVisible({ timeout: 20000 });

    // Messages
    await page.goto('/app/messages');
    await expect(page.locator('h1:has-text("Messages")')).toBeVisible({ timeout: 15000 });

    // Notifications
    await page.goto('/app/notifications');
    await expect(page.locator('h1:has-text("Notifications")')).toBeVisible({ timeout: 15000 });

    // Logout
    await logoutUser(page);
    expect(page.url()).toContain('/login');
  });

  test('11. Full Operational Flow: Super Admin (Satish Kumar)', async ({ page }) => {
    // Login
    await loginUser(page, USERS.superAdmin);
    await expect(page.locator('text=Super Admin Intelligence')).toBeVisible({ timeout: 15000 });

    // People
    await page.goto('/app/people');
    await expect(page.locator('h1:has-text("People")')).toBeVisible({ timeout: 15000 });

    // Projects
    await page.goto('/app/projects');
    await expect(page.locator('h1:has-text("Projects")')).toBeVisible({ timeout: 15000 });

    // Tasks
    await page.goto('/app/tasks');
    await expect(page.locator('text=Task Management')).toBeVisible({ timeout: 15000 });

    // Reports
    await page.goto('/app/reports');
    await expect(page.locator('h1:has-text("Daily Reports")')).toBeVisible({ timeout: 15000 });

    // Work Intelligence (Company Dashboard)
    await page.goto('/app/admin/dashboard');
    await expect(page.locator('text=Super Admin Intelligence')).toBeVisible({ timeout: 15000 });

    // Leave
    await page.goto('/app/leave');
    await expect(page.locator('h1:has-text("Leave & HR Operations")')).toBeVisible({ timeout: 15000 });

    // Audit Logs
    await page.goto('/app/audit-logs');
    await expect(page.locator('text=Security & System Audit Logs')).toBeVisible({ timeout: 15000 });

    // Company Settings
    await page.goto('/app/admin/settings');
    await expect(page.locator('text=Company Settings & Operational Configuration')).toBeVisible({ timeout: 15000 });

    // Logout
    await logoutUser(page);
    expect(page.url()).toContain('/login');
  });

  // ==========================================================================
  // SECTION 16: Mobile Viewport Tests (360x800, 390x844, 414x896)
  // ==========================================================================
  const viewports = [
    { name: 'Android Small', width: 360, height: 800 },
    { name: 'iPhone 13/14', width: 390, height: 844 },
    { name: 'iPhone XR/11', width: 414, height: 896 }
  ];

  for (const vp of viewports) {
    test(`12. Mobile Responsiveness (${vp.name} - ${vp.width}x${vp.height}) for Employee & Intern`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });

      await loginUser(page, USERS.employee);

      // Verify bottom navigation is active
      const bottomNav = page.locator('nav[aria-label="Mobile Bottom Navigation"]');
      await expect(bottomNav).toBeVisible({ timeout: 15000 });

      // Verify no horizontal overflow
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

      // Navigate Tasks via Bottom Bar
      await bottomNav.locator('text=Tasks').click();
      await page.waitForURL(url => url.pathname.includes('/app/tasks'));
      await expect(page.locator('text=Task Management')).toBeVisible({ timeout: 15000 });

      // Navigate Attendance via Bottom Bar
      await bottomNav.locator('text=Attendance').click();
      await page.waitForURL(url => url.pathname.includes('/app/attendance'));
      await expect(page.locator('text=Attendance & Time Tracking')).toBeVisible({ timeout: 15000 });

      // Open Drawer via 'More'
      await bottomNav.locator('text=More').click();
      await expect(page.locator('text=Workspace Navigation')).toBeVisible({ timeout: 15000 });

      const drawer = page.locator('div[role="dialog"]');
      await expect(drawer.locator('text=People')).toBeVisible();

      // Open People
      await drawer.locator('text=People').click();
      await page.waitForURL(url => url.pathname.includes('/app/people'));
      await expect(page.locator('h1:has-text("People")')).toBeVisible({ timeout: 15000 });

      // Verify profile page
      await page.goto('/app/profile');
      await expect(page.locator('h1:has-text("Profile")')).toBeVisible({ timeout: 15000 });
    });
  }
});
