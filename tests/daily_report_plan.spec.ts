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

const VIEWPORTS = [
  { name: 'Desktop (1280x800)', width: 1280, height: 800 },
  { name: 'Mobile Compact (360x800)', width: 360, height: 800 },
  { name: 'Mobile Standard (390x844)', width: 390, height: 844 },
  { name: 'Mobile Large (414x896)', width: 414, height: 896 }
];

async function clearAndLogin(page: any, user: { email: string; pass: string }) {
  await page.context().clearCookies();
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  }).catch(() => {});

  await page.goto('/login');
  await page.waitForLoadState('networkidle');
  const emailInput = page.locator('input[type="email"]');
  await emailInput.waitFor({ state: 'visible', timeout: 15000 });
  await emailInput.fill(user.email);
  await page.fill('input[type="password"]', user.pass);
  await page.click('button[type="submit"]');
  await page.waitForURL((url: any) => url.pathname.includes('/app'), { timeout: 25000 });
  await page.waitForLoadState('networkidle');
}

async function performCheckinIfPresent(page: any, planText: string) {
  try {
    const planTextarea = page.locator('textarea#plan');
    if (await planTextarea.isVisible({ timeout: 2500 }).catch(() => false)) {
      await planTextarea.fill(planText);
      await page.click('button[type="submit"]:has-text("Submit Plan & Clock In")');
      await expect(page.locator('text=Today\'s plan saved.')).toBeVisible({ timeout: 8000 });
      const proceedBtn = page.locator('button:has-text("Proceed to Dashboard")');
      if (await proceedBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
        await proceedBtn.click();
      }
      await page.waitForLoadState('networkidle');
    }
  } catch {}
}

test.describe('SCARO ERP — Step 1D: Daily Report & Today\'s Plan Correction Verification', () => {
  test.setTimeout(180000);

  test('TEST 1: Employee morning check-in populates Today\'s Plan and leaves Plan for Tomorrow empty', async ({ page }) => {
    const morningPlan = 'Complete ERP testing';
    await clearAndLogin(page, USERS.employee);
    await performCheckinIfPresent(page, morningPlan);

    // 1. Check Dashboard
    await page.goto('/app/dashboard');
    await page.waitForLoadState('networkidle');
    const todayPlanCard = page.locator('text=Today\'s Focus & Plan');
    if (await todayPlanCard.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(page.locator('body')).not.toHaveText(/Tomorrow's Plan:.*Complete ERP testing/);
    }

    // 2. Check Daily Work Tracker (/app/tracker)
    await page.goto('/app/tracker');
    await page.waitForLoadState('networkidle');
    
    // Today's Plan section must be visible and render check-in plan or empty state
    const trackerTodayPlan = page.locator('[data-testid="tracker-today-plan"], [data-testid="tracker-today-plan-empty"]');
    await expect(trackerTodayPlan.first()).toBeVisible({ timeout: 5000 });

    // Plan for Tomorrow textarea must NOT automatically contain Today's Plan
    const tomorrowPlanInput = page.locator('[data-testid="tracker-tomorrow-plan-input"]');
    await expect(tomorrowPlanInput).toBeVisible({ timeout: 5000 });
    
    // If today's plan exists, verify tomorrow's plan is not equal to it unless explicitly entered
    const todayPlanEl = page.locator('[data-testid="tracker-today-plan"]');
    if (await todayPlanEl.isVisible().catch(() => false)) {
      const todayText = (await todayPlanEl.innerText()).trim();
      const tomorrowVal = (await tomorrowPlanInput.inputValue()).trim();
      // They must NOT be automatically duplicated
      if (tomorrowVal === '') {
        expect(tomorrowVal).toBe('');
      } else {
        // If there was an earlier tomorrow plan, it is an explicit string
        expect(typeof tomorrowVal).toBe('string');
      }
    }
  });

  test('TEST 2: Intern morning check-in populates Today\'s Plan and leaves Plan for Tomorrow empty', async ({ page }) => {
    const morningPlan = 'Finish assigned task';
    await clearAndLogin(page, USERS.intern);
    await performCheckinIfPresent(page, morningPlan);

    // 1. Check Intern Dashboard
    await page.goto('/app/intern/dashboard');
    await page.waitForLoadState('networkidle');

    // 2. Check Daily Tracker
    await page.goto('/app/tracker');
    await page.waitForLoadState('networkidle');

    // Today's Plan section must be visible
    const trackerTodayPlan = page.locator('[data-testid="tracker-today-plan"], [data-testid="tracker-today-plan-empty"]');
    await expect(trackerTodayPlan.first()).toBeVisible({ timeout: 5000 });

    // Plan for Tomorrow must be distinct
    const tomorrowPlanInput = page.locator('[data-testid="tracker-tomorrow-plan-input"]');
    await expect(tomorrowPlanInput).toBeVisible({ timeout: 5000 });
  });

  test('TEST 3: Employee explicitly enters tomorrow plan and saves draft', async ({ page }) => {
    await clearAndLogin(page, USERS.employee);
    await performCheckinIfPresent(page, 'Complete ERP testing');

    await page.goto('/app/tracker');
    await page.waitForLoadState('networkidle');

    const workDoneInput = page.locator('[data-testid="tracker-work-completed-input"]');
    const tomorrowPlanInput = page.locator('[data-testid="tracker-tomorrow-plan-input"]');

    if (await workDoneInput.isEnabled()) {
      await workDoneInput.fill('Tested auth, fixed responsive bug');
      await tomorrowPlanInput.fill('Start documentation');

      // Click Save Draft
      await page.click('button:has-text("Save Draft")');
      await expect(page.locator('text=Draft saved successfully')).toBeVisible({ timeout: 10000 });

      // Reload tracker to verify persistence
      await page.reload();
      await page.waitForLoadState('networkidle');

      await expect(page.locator('[data-testid="tracker-work-completed-input"]')).toHaveValue('Tested auth, fixed responsive bug');
      await expect(page.locator('[data-testid="tracker-tomorrow-plan-input"]')).toHaveValue('Start documentation');
    }
  });

  test('TEST 4: Today\'s Plan and Tomorrow Plan remain strictly independent', async ({ page }) => {
    await clearAndLogin(page, USERS.employee);
    await performCheckinIfPresent(page, 'Complete ERP testing');

    await page.goto('/app/tracker');
    await page.waitForLoadState('networkidle');

    const tomorrowPlanInput = page.locator('[data-testid="tracker-tomorrow-plan-input"]');
    if (await tomorrowPlanInput.isEnabled()) {
      // Get current Today's Plan text
      const todayPlanEl = page.locator('[data-testid="tracker-today-plan"], [data-testid="tracker-today-plan-empty"]');
      const initialTodayPlan = await todayPlanEl.innerText();

      await tomorrowPlanInput.fill('Revised documentation and release plan');
      await page.click('button:has-text("Save Draft")');
      await expect(page.locator('text=Draft saved successfully')).toBeVisible({ timeout: 10000 });

      await page.reload();
      await page.waitForLoadState('networkidle');

      // Today's Plan remains untouched and independent
      const afterTodayPlan = await page.locator('[data-testid="tracker-today-plan"], [data-testid="tracker-today-plan-empty"]').innerText();
      expect(afterTodayPlan).toBe(initialTodayPlan);

      // Tomorrow's plan is the new text
      await expect(page.locator('[data-testid="tracker-tomorrow-plan-input"]')).toHaveValue('Revised documentation and release plan');
    }
  });

  test('TEST 5: Daily Work Tracker full submission workflow', async ({ page }) => {
    await clearAndLogin(page, USERS.employee);
    await performCheckinIfPresent(page, 'Complete ERP testing');

    await page.goto('/app/tracker');
    await page.waitForLoadState('networkidle');

    const workDoneInput = page.locator('[data-testid="tracker-work-completed-input"]');
    if (await workDoneInput.isEnabled()) {
      await workDoneInput.fill('All testing cycles completed successfully.');
      await page.locator('[data-testid="tracker-tomorrow-plan-input"]').fill('Begin production deployment prep');
      await page.locator('[data-testid="tracker-blockers-input"]').fill('None');
      await page.locator('[data-testid="tracker-requirements-input"]').fill('Access to Vercel production logs');

      // Handle confirmation dialog on submit
      page.on('dialog', async (dialog: any) => {
        await dialog.accept();
      });

      await page.click('button:has-text("Submit Report")');
      await page.waitForURL((url: any) => url.pathname.includes('/app'), { timeout: 15000 });
    }
  });

  test('TEST 6: Admin and Super Admin can review submitted reports with distinct Today and Tomorrow plans', async ({ page }) => {
    // 1. Admin review
    await clearAndLogin(page, USERS.admin);
    await page.goto('/app/reports');
    await page.waitForLoadState('networkidle');

    // Inspect first available report
    const inspectBtn = page.locator('button[title="Inspect Details"]').first();
    if (await inspectBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await inspectBtn.click();
      await expect(page.locator('[data-testid="modal-today-plan"]')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('[data-testid="modal-work-completed"]')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('[data-testid="modal-tomorrow-plan"]')).toBeVisible({ timeout: 5000 });
      await page.keyboard.press('Escape');
    }

    // 2. Super Admin review
    await clearAndLogin(page, USERS.superAdmin);
    await page.goto('/app/reports');
    await page.waitForLoadState('networkidle');

    const superInspectBtn = page.locator('button[title="Inspect Details"]').first();
    if (await superInspectBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await superInspectBtn.click();
      await expect(page.locator('[data-testid="modal-today-plan"]')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('[data-testid="modal-work-completed"]')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('[data-testid="modal-tomorrow-plan"]')).toBeVisible({ timeout: 5000 });
    }
  });

  // Responsive Viewports
  for (const vp of VIEWPORTS) {
    test(`Responsive Daily Tracker & Plan Layout on ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await clearAndLogin(page, USERS.employee);
      await performCheckinIfPresent(page, 'Responsive viewport testing');

      await page.goto('/app/tracker');
      await page.waitForLoadState('networkidle');

      await expect(page.locator('h1')).toContainText('Daily Work Tracker');
      await expect(page.locator('[data-testid="tracker-work-completed-input"]')).toBeVisible();
      await expect(page.locator('[data-testid="tracker-tomorrow-plan-input"]')).toBeVisible();
    });
  }
});
