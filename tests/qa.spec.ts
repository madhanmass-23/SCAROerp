import { test, expect } from '@playwright/test';

test.describe.serial('Phase 4 QA - Daily Work Tracker', () => {

  test('Employee Tracker Flow', async ({ page }) => {
    // 1. Login as Employee
    await page.goto('/');
    await page.fill('input[type="email"]', 'employee@scaro.com');
    await page.fill('input[type="password"]', 'Scaro@Employee2026!');
    await page.click('button[type="submit"]');

    await page.waitForURL('**/app/**', { timeout: 15000 });

    // Wait for EITHER the Check-in form OR the Dashboard Sidebar
    await Promise.race([
      page.waitForSelector('textarea#plan', { timeout: 15000 }),
      page.waitForSelector('text=Daily Tracker', { timeout: 15000 })
    ]);

    if (await page.locator('textarea#plan').isVisible()) {
      await page.fill('textarea#plan', 'QA test plan');
      await page.click('button[type="submit"]');
      await expect(page.locator('textarea#plan')).toBeHidden({ timeout: 15000 });
    }

    // Go to Daily Tracker
    try {
      await page.click('text=Daily Tracker', { timeout: 10000 });
    } catch (e) {
      console.error('FAILED TO FIND DAILY TRACKER. Page text:', await page.locator('body').innerText());
      throw e;
    }
    
    // Wait for tracker state to render (either draft state with Add Task Record or locked state)
    await Promise.race([
      page.waitForSelector('text=locked for review', { timeout: 10000 }),
      page.waitForSelector('text=Add Task Record', { timeout: 10000 }),
    ]).catch(() => {});

    // Check if already submitted today
    if (await page.locator('text=locked for review').isVisible()) {
      console.log('Report already submitted for today, verified locked state');
      await expect(page.locator('text=Submitted').first()).toBeVisible();
      await page.evaluate(() => localStorage.clear());
      return;
    }

    // Add a Task Record
    await page.click('text=Add Task Record');
    
    // Fill custom task
    await page.fill('input[placeholder="Describe custom task"]', 'Employee QA Task');
    // Fill Time
    await page.fill('input[type="number"]', '120');
    
    // Move Progress - input[type="range"] might be tricky, let's just evaluate or fill
    await page.evaluate(() => {
      const range = document.querySelector('input[type="range"]') as HTMLInputElement;
      if (range) {
        range.value = '50';
        range.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    // Set Status
    await page.locator('select').nth(1).selectOption({ label: 'In Progress' });

    // Fill notes and blockers
    await page.fill('textarea[placeholder="What else did you accomplish?"]', 'QA Work completed');
    await page.fill('textarea[placeholder="Anything slowing you down?"]', 'No blockers');
    await page.fill('textarea[placeholder="What will you work on tomorrow?"]', 'More QA');
    await page.fill('input[placeholder*="Requested new software license"]', 'Need a license');

    // Save Draft
    await page.click('text=Save Draft');
    await page.waitForTimeout(2000);

    // Reload and verify
    await page.reload();
    await expect(page.locator('textarea[placeholder="What else did you accomplish?"]')).toHaveValue('QA Work completed');

    // Upload File Evidence (Mock)
    await page.setInputFiles('input[type="file"]', {
      name: 'evidence.png',
      mimeType: 'image/png',
      buffer: Buffer.from('mock image content')
    });
    // Wait for the upload row to appear
    await expect(page.locator('text=evidence.png')).toBeVisible({ timeout: 10000 });

    // Submit Report
    page.on('dialog', dialog => dialog.accept());
    await page.click('text=Submit Report');
    await page.waitForTimeout(3000);

    // Go back to tracker
    await page.goto('/app/tracker');
    await expect(page.locator('text=Submitted').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=locked for review')).toBeVisible();

    // Log out
    const logoutBtn = page.locator('button:has-text("Logout"), button[title="Logout"]');
    if (await logoutBtn.first().isVisible().catch(() => false)) {
       await logoutBtn.first().click();
    } else {
       // Force logout via auth context or clear storage
       await page.evaluate(() => localStorage.clear());
    }
  });

  test('Intern Tracker Flow', async ({ page }) => {
    // 1. Login as Intern
    await page.goto('/');
    await page.fill('input[type="email"]', 'intern@scaro.com');
    await page.fill('input[type="password"]', 'Scaro@Intern2026!');
    await page.click('button[type="submit"]');

    await page.waitForURL('**/app/**', { timeout: 15000 });

    await Promise.race([
      page.waitForSelector('textarea#plan', { timeout: 15000 }),
      page.waitForSelector('text=Daily Tracker', { timeout: 15000 })
    ]);

    if (await page.locator('textarea#plan').isVisible()) {
      await page.fill('textarea#plan', 'QA test plan for intern');
      await page.click('button[type="submit"]');
      await expect(page.locator('textarea#plan')).toBeHidden({ timeout: 15000 });
    }

    // Go to Daily Tracker
    await page.click('text=Daily Tracker', { timeout: 10000 });

    // Wait for tracker state to render
    await Promise.race([
      page.waitForSelector('text=locked for review', { timeout: 10000 }),
      page.waitForSelector('textarea[placeholder="What else did you accomplish?"]', { timeout: 10000 }),
    ]).catch(() => {});

    // Check if already submitted today
    if (await page.locator('text=locked for review').isVisible()) {
      console.log('Intern report already submitted for today, verified locked state');
      await expect(page.locator('text=Submitted').first()).toBeVisible();
      await page.evaluate(() => localStorage.clear());
      return;
    }

    await page.fill('textarea[placeholder="What else did you accomplish?"]', 'Intern QA Work');
    
    // Upload File Evidence (Document)
    await page.setInputFiles('input[type="file"]', {
      name: 'intern_evidence.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('mock pdf content')
    });
    await expect(page.locator('text=intern_evidence.pdf')).toBeVisible({ timeout: 10000 });

    // Submit Report
    page.on('dialog', dialog => dialog.accept()); 
    await page.click('text=Submit Report');
    await page.waitForTimeout(3000);

    await page.goto('/app/tracker');
    await expect(page.locator('text=locked for review')).toBeVisible({ timeout: 10000 });
    
    await page.evaluate(() => localStorage.clear());
  });

  test('Admin Review', async ({ page }) => {
    // Login as Admin
    await page.goto('/');
    await page.fill('input[type="email"]', 'manager@scaro.com');
    await page.fill('input[type="password"]', 'Scaro@Manager2026!');
    await page.click('button[type="submit"]');

    await page.waitForURL('**/app/**', { timeout: 15000 });

    // Go to Reports
    await page.click('text=All Reports', { timeout: 10000 });

    await expect(page.locator('text=SCARO Employee').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=SCARO Intern').first()).toBeVisible();

    await page.evaluate(() => localStorage.clear());
  });

  test('Super Admin Review', async ({ page }) => {
    // Login as Super Admin
    await page.goto('/');
    await page.fill('input[type="email"]', 'admin@scaro.com');
    await page.fill('input[type="password"]', 'Scaro@Admin2026!');
    await page.click('button[type="submit"]');

    await page.waitForURL('**/app/**', { timeout: 15000 });

    // Go to Reports
    await page.click('text=All Reports', { timeout: 10000 });

    await expect(page.locator('text=SCARO Employee').first()).toBeVisible({ timeout: 10000 });
    
    await page.evaluate(() => localStorage.clear());
  });

});
