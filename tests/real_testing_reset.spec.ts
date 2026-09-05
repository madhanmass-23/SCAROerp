import { test, expect } from '@playwright/test';

const USERS = {
  intern: {
    name: 'Maheswari',
    email: 'maheswari@scaro.in',
    pass: 'Scaro@Maheswari2026!',
    expectedRoute: '/app/intern/dashboard'
  },
  employee: {
    name: 'Madhan',
    email: 'madhan@scaro.in',
    pass: 'Scaro@Madhan2026!',
    expectedRoute: '/app/dashboard'
  },
  admin: {
    name: 'Kumar',
    email: 'kumar@scaro.in',
    pass: 'Scaro@Kumar2026!',
    expectedRoute: '/app/admin/overview'
  },
  superAdmin: {
    name: 'Satish Kumar',
    email: 'satishkumar@scaro.in',
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

test.describe('SCARO ERP — Real Testing Environment & Role Verification', () => {
  test.setTimeout(60000); // 60s per test for network latency and full ERP flows

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

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

  // SECTION 11 & 12: Login & Role Routing Tests
  test('1. Intern Login, Daily Check-in & Dashboard Routing', async ({ page }) => {
    await loginUser(page, USERS.intern, 'Intern training: mastering tasks and daily reporting');

    await page.waitForURL(url => url.pathname.includes('/app/intern/dashboard'), { timeout: 20000 });
    expect(page.url()).toContain('/app/intern/dashboard');
    await expect(page.locator('text=Intern Training Hub')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=Today\'s Focus & Plan')).toBeVisible();
    await expect(page.locator('text=Clocked In')).toBeVisible();
  });

  test('2. Employee Login, Daily Check-in & Dashboard Routing', async ({ page }) => {
    await loginUser(page, USERS.employee, 'Employee work: project tasks and team collaboration');

    await page.waitForURL(url => url.pathname.includes('/app/dashboard'), { timeout: 20000 });
    expect(page.url()).toContain('/app/dashboard');
    await expect(page.locator('text=Welcome back')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=Today\'s Focus & Plan')).toBeVisible();
  });

  test('3. Admin Login & Operational Dashboard Routing', async ({ page }) => {
    await loginUser(page, USERS.admin);

    await page.waitForURL(url => url.pathname.includes('/app/admin/overview'), { timeout: 20000 });
    expect(page.url()).toContain('/app/admin/overview');
    await expect(page.locator('text=Operations & Team Control')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=Team Members').first()).toBeVisible();
  });

  test('4. Super Admin Login & Company Intelligence Dashboard Routing', async ({ page }) => {
    await loginUser(page, USERS.superAdmin);

    await page.waitForURL(url => url.pathname.includes('/app/admin/dashboard'), { timeout: 20000 });
    expect(page.url()).toContain('/app/admin/dashboard');
    await expect(page.locator('text=Super Admin Intelligence')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=Active Accounts').first()).toBeVisible();
  });

  // SECTION 13: Access Control & Role Isolation
  test('5. Role Isolation: Intern cannot access Admin or Super Admin routes', async ({ page }) => {
    await loginUser(page, USERS.intern);

    // Attempt direct access to Super Admin dashboard -> Should redirect to intern hub
    await page.goto('/app/admin/dashboard');
    await expect(page).toHaveURL(/\/app\/intern\/dashboard/, { timeout: 20000 });

    // Attempt direct access to Audit Logs -> Should redirect
    await page.goto('/app/audit-logs');
    await expect(page).toHaveURL(/\/app\/intern\/dashboard/, { timeout: 20000 });

    // Attempt direct access to Company Settings -> Should redirect
    await page.goto('/app/admin/settings');
    await expect(page).toHaveURL(/\/app\/intern\/dashboard/, { timeout: 20000 });
  });

  test('6. Role Isolation: Employee cannot access Admin overview', async ({ page }) => {
    await loginUser(page, USERS.employee);

    await page.goto('/app/admin/overview');
    await expect(page).toHaveURL(/\/app\/dashboard/, { timeout: 20000 });
  });

  // SECTION 14: Empty State Cleanliness Verification
  test('7. Empty State Verification on Clean Operational Tables', async ({ page }) => {
    await loginUser(page, USERS.employee);

    // Tasks Page
    await page.goto('/app/tasks');
    await expect(page.locator('text=Task Management')).toBeVisible({ timeout: 15000 });
    let content = await page.content();
    expect(content).not.toContain('NaN');
    expect(content).not.toContain('undefined');

    // Projects Page
    await page.goto('/app/projects');
    await expect(page.locator('h1:has-text("Projects")')).toBeVisible({ timeout: 15000 });
    content = await page.content();
    expect(content).not.toContain('NaN');

    // Attendance Page
    await page.goto('/app/attendance');
    await expect(page.locator('text=Attendance & Time Tracking')).toBeVisible({ timeout: 15000 });

    // Meetings Page
    await page.goto('/app/meetings');
    await expect(page.locator('text=Meetings & Syncs')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=No upcoming meetings')).toBeVisible();

    // Messages Page
    await page.goto('/app/messages');
    await expect(page.locator('h1:has-text("Messages")')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=No conversations yet')).toBeVisible();

    // People (15 members cleanly listed)
    await page.goto('/app/people');
    await expect(page.locator('h1:has-text("People")')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=15 Members')).toBeVisible();

    // Announcements Page
    await page.goto('/app/announcements');
    await expect(page.locator('h1:has-text("Announcements")')).toBeVisible({ timeout: 15000 });
  });

  // SECTION 16: Mobile Viewport Responsiveness
  test('8. Mobile Viewport (390x844) Responsiveness for Employee', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    await loginUser(page, USERS.employee);

    // Verify Mobile Bottom Navigation is rendered
    const bottomNav = page.locator('nav[aria-label="Mobile Bottom Navigation"]');
    await expect(bottomNav).toBeVisible({ timeout: 15000 });

    // Verify no horizontal overflow
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

    // Tap Tasks on bottom bar
    await bottomNav.locator('text=Tasks').click();
    await page.waitForURL(url => url.pathname.includes('/app/tasks'));
    await expect(page.locator('text=Task Management')).toBeVisible();

    // Tap Attendance on bottom bar
    await bottomNav.locator('text=Attendance').click();
    await page.waitForURL(url => url.pathname.includes('/app/attendance'));
    await expect(page.locator('text=Attendance & Time Tracking')).toBeVisible();

    // Tap More to open drawer
    await bottomNav.locator('text=More').click();
    await expect(page.locator('text=Workspace Navigation')).toBeVisible();

    const drawer = page.locator('div[role="dialog"]');
    await expect(drawer.locator('text=People')).toBeVisible();

    // Open People via drawer
    await drawer.locator('text=People').click();
    await page.waitForURL(url => url.pathname.includes('/app/people'));
    await expect(page.locator('h1:has-text("People")')).toBeVisible();
  });

  // Super Admin Management Features (Audit Logs & Company Settings Mutation)
  test('9. Super Admin Features: Audit Logs and Company Settings Mutation', async ({ page }) => {
    await loginUser(page, USERS.superAdmin);

    // Visit Audit Logs
    await page.goto('/app/audit-logs');
    await expect(page.locator('text=Security & System Audit Logs')).toBeVisible({ timeout: 15000 });

    // Visit Company Settings
    await page.goto('/app/admin/settings');
    await expect(page.locator('text=Company Settings & Operational Configuration')).toBeVisible({ timeout: 15000 });

    // Verify company name input has 'SCARO'
    const nameInput = page.locator('#company_name');
    await expect(nameInput).toHaveValue('SCARO');

    // Mutate company name and save
    await nameInput.fill('SCARO Technologies');
    await page.click('button:has-text("Save Settings")');
    await expect(page.locator('text=Company settings successfully updated')).toBeVisible({ timeout: 10000 });

    // Revert back to SCARO
    await nameInput.fill('SCARO');
    await page.click('button:has-text("Save Settings")');
    await expect(page.locator('text=Company settings successfully updated')).toBeVisible({ timeout: 10000 });
  });

});
