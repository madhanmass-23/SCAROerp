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
    const planBox = page.locator('textarea#plan, textarea[placeholder*="Outline the key tasks"]');
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
    // Already checked in
  }
}

async function loginUser(page: any, user: any, planText = 'Focusing on operational task assignments today') {
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto('/login');
    const emailInput = page.locator('input[type="email"]:not([disabled])');
    await expect(emailInput).toBeVisible({ timeout: 15000 });
    await emailInput.fill(user.email);
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

test.describe('SCARO ERP — Phase 10 Product Update Verification', () => {
  test.setTimeout(90000);

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.reload();
  });

  // ==========================================================================
  // TEST 1: PWA Install Button on Sign-in Page across viewports
  // ==========================================================================
  const loginViewports = [
    { name: 'Desktop', width: 1280, height: 800 },
    { name: 'Android Small', width: 360, height: 800 },
    { name: 'iPhone 13/14', width: 390, height: 844 },
    { name: 'iPhone XR', width: 414, height: 896 }
  ];

  for (const vp of loginViewports) {
    test(`PWA Install Action on /login (${vp.name} - ${vp.width}x${vp.height})`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/login');

      // 1. Verify Login inputs and button exist and are visible
      const emailInput = page.locator('input[type="email"]:not([disabled])');
      const passwordInput = page.locator('input[type="password"]');
      const signInBtn = page.locator('button[type="submit"]:has-text("Sign In")');

      await expect(emailInput).toBeVisible({ timeout: 10000 });
      await expect(passwordInput).toBeVisible();
      await expect(signInBtn).toBeVisible();

      // 2. Verify PWA Install Button is visible and clearly separated
      const installBtn = page.locator('#pwa-install-button');
      await expect(installBtn).toBeVisible();
      await expect(installBtn).toContainText('Install SCARO ERP App');

      // 3. Verify no vertical overlap: install button top should be below sign in button bottom
      const signInBox = await signInBtn.boundingBox();
      const installBox = await installBtn.boundingBox();
      expect(signInBox).not.toBeNull();
      expect(installBox).not.toBeNull();
      if (signInBox && installBox) {
        expect(installBox.y).toBeGreaterThan(signInBox.y + signInBox.height);
      }

      // 4. Click install button to trigger instructional modal (in standard test browser)
      await installBtn.click();
      const modal = page.locator('div[role="dialog"]');
      await expect(modal).toBeVisible();
      await expect(modal).toContainText('Install SCARO ERP');

      // 5. Test platform switcher tabs in modal
      await expect(modal.locator('button:has-text("Android")')).toBeVisible();
      await expect(modal.locator('button:has-text("iOS / Safari")')).toBeVisible();
      await expect(modal.locator('button:has-text("Desktop")')).toBeVisible();

      // Switch to iOS
      await modal.locator('button:has-text("iOS / Safari")').click();
      await expect(modal.locator('text=Add to Home Screen')).toBeVisible();

      // Close modal
      await modal.locator('button:has-text("Got it")').click();
      await expect(modal).not.toBeVisible();
    });
  }

  // ==========================================================================
  // TEST 2: People Navigation & Company Directory Experience
  // ==========================================================================
  test('People Directory Unification & Details Modal', async ({ page }) => {
    await loginUser(page, USERS.employee);

    // Verify Sidebar navigation says 'People' (not 'People Directory')
    const sidebar = page.locator('aside');
    await expect(sidebar.locator('a[href="/app/people"]')).toContainText('People');
    await expect(sidebar.locator('text=People Directory')).toHaveCount(0);

    // Navigate to People
    await sidebar.locator('a[href="/app/people"]').click();
    await page.waitForURL('**/app/people');

    // Verify Header is People
    await expect(page.locator('h1:has-text("People")')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=15 Members')).toBeVisible();

    // Verify Active status badges are displayed
    const activeBadges = page.locator('span:text-is("Active")');
    await expect(activeBadges.first()).toBeVisible();
    const activeCount = await activeBadges.count();
    expect(activeCount).toBeGreaterThanOrEqual(1);

    // Verify card content contains person info (e.g. Madhan)
    const madhanCard = page.locator('div.cursor-pointer', { hasText: 'Madhan' }).first();
    await expect(madhanCard).toBeVisible();
    await expect(madhanCard.locator('span:text-is("Employee")').first()).toBeVisible();

    // Click person card to open Person Details Modal
    await madhanCard.click();

    const detailsModal = page.locator('div[role="dialog"]');
    await expect(detailsModal).toBeVisible();
    await expect(detailsModal).toContainText('Person Details');
    await expect(detailsModal).toContainText('Madhan');
    await expect(detailsModal).toContainText('Organization');
    await expect(detailsModal).toContainText('Contact & Communication');
    await expect(detailsModal).toContainText('Professional Profiles');

    // Close details modal
    await detailsModal.locator('button:has-text("Close")').click();
    await expect(detailsModal).not.toBeVisible();
  });

  // ==========================================================================
  // TEST 3: Mobile Viewport for People Page (Compact Cards)
  // ==========================================================================
  test('People Page Mobile Viewport (390x844)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginUser(page, USERS.employee);

    // Open More drawer and verify 'People'
    const bottomNav = page.locator('nav[aria-label="Mobile Bottom Navigation"]');
    await bottomNav.locator('text=More').click();

    const drawer = page.locator('div[role="dialog"]');
    await expect(drawer.locator('a[href="/app/people"]')).toContainText('People');
    await expect(drawer.locator('text=People Directory')).toHaveCount(0);

    // Navigate to People via mobile drawer
    await drawer.locator('a[href="/app/people"]').click();
    await page.waitForURL('**/app/people');

    await expect(page.locator('h1:has-text("People")')).toBeVisible({ timeout: 15000 });

    // Verify horizontal overflow is zero
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

    // Click first card on mobile
    const firstCard = page.locator('div.cursor-pointer').first();
    await firstCard.click();

    const detailsModal = page.locator('div[role="dialog"]');
    await expect(detailsModal).toBeVisible();
    await expect(detailsModal).toContainText('Person Details');
    await detailsModal.locator('button:has-text("Close")').click();
  });

  // ==========================================================================
  // TEST 4: Employee Profile Self-Service & Locked Organization Fields
  // ==========================================================================
  test('Employee Profile Editing UX (Self-Service + Locked Fields)', async ({ page }) => {
    await loginUser(page, USERS.employee);

    // Navigate to Profile
    await page.goto('/app/profile');
    await expect(page.locator('h1:has-text("User Profile")')).toBeVisible({ timeout: 15000 });

    // 1. Verify strictly locked organization fields are visible
    await expect(page.locator('text=Organization Assignment')).toBeVisible();
    await expect(page.locator('text=Primary login identifier')).toBeVisible();
    await expect(page.locator('text=Permission boundary level')).toBeVisible();
    await expect(page.locator('text=Assigned organizational unit')).toBeVisible();

    // 2. Verify editable form inputs exist
    const fullNameInput = page.locator('input[placeholder="Enter your full name"]');
    const phoneInput = page.locator('input[placeholder*="555-0199"]');
    const linkedinInput = page.locator('input[placeholder*="linkedin.com"]');
    const githubInput = page.locator('input[placeholder*="github.com"]');

    await expect(fullNameInput).toBeVisible();
    await expect(phoneInput).toBeVisible();
    await expect(linkedinInput).toBeVisible();
    await expect(githubInput).toBeVisible();

    // 3. Edit self-service fields
    const testPhone = '+1 555-0188';
    const testLinkedin = 'https://linkedin.com/in/madhan-scaro';
    const testGithub = 'https://github.com/madhan-scaro';

    await phoneInput.fill(testPhone);
    await linkedinInput.fill(testLinkedin);
    await githubInput.fill(testGithub);

    // 4. Save profile
    const saveBtn = page.locator('button:has-text("Save Profile")');
    await saveBtn.click();

    // 5. Verify success alert without page reload
    await expect(page.locator('text=Profile details saved successfully!')).toBeVisible({ timeout: 10000 });

    // 6. Navigate away and back to verify persistence
    await page.goto('/app/dashboard');
    await page.waitForURL('**/app/dashboard');
    await page.goto('/app/profile');
    await page.waitForURL('**/app/profile');
    await expect(page.locator('h1:has-text("User Profile")')).toBeVisible({ timeout: 15000 });

    await expect(page.locator('input[placeholder*="555-0199"]')).toHaveValue(testPhone, { timeout: 15000 });
    await expect(page.locator('input[placeholder*="linkedin.com"]')).toHaveValue(testLinkedin, { timeout: 15000 });
    await expect(page.locator('input[placeholder*="github.com"]')).toHaveValue(testGithub, { timeout: 15000 });

    // 7. Verify LinkedIn and GitHub preview links are visible in Overview Hero Card
    await expect(page.locator('a:has-text("LinkedIn Profile")')).toBeVisible();
    await expect(page.locator('a:has-text("GitHub Profile")')).toBeVisible();
  });

  // ==========================================================================
  // TEST 5: Intern Profile Self-Service & Role Security
  // ==========================================================================
  test('Intern Profile Editing UX (Self-Service + Role Security)', async ({ page }) => {
    await loginUser(page, USERS.intern);

    // Navigate to Profile
    await page.goto('/app/profile');
    await expect(page.locator('h1:has-text("User Profile")')).toBeVisible({ timeout: 15000 });

    // Verify role shows 'Intern' in locked organization section
    await expect(page.locator('text=Organization Assignment')).toBeVisible();
    const orgCard = page.locator('div', { hasText: 'Organization Assignment' });
    await expect(orgCard.locator('span:text-is("Intern")').first()).toBeVisible();

    // Verify Intern can edit self-service fields
    const linkedinInput = page.locator('input[placeholder*="linkedin.com"]');
    await linkedinInput.fill('https://linkedin.com/in/maheswari-intern');
    await page.click('button:has-text("Save Profile")');

    await expect(page.locator('text=Profile details saved successfully!')).toBeVisible({ timeout: 10000 });
  });

});
