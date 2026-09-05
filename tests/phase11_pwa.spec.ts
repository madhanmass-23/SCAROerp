import { test, expect } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env.admin.local') });
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const USERS = {
  employee: {
    email: 'madhan@scaro.in',
    pass: 'Scaro@Madhan2026!',
    expectedRoute: '/app/dashboard',
    role: 'Employee'
  },
  intern: {
    email: 'maheswari@scaro.in',
    pass: 'Scaro@Maheswari2026!',
    expectedRoute: '/app/intern/dashboard',
    role: 'Intern'
  }
};

async function handleCheckinIfNeeded(page: any) {
  try {
    const planBox = page.locator('textarea#plan, textarea[placeholder*="Outline the key tasks"]');
    const isVisible = await planBox.waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false);
    if (isVisible) {
      await planBox.fill('Focusing on PWA verification today');
      await page.click('button:has-text("Submit Plan & Clock In")');
      await expect(page.locator('text=Today\'s plan saved.')).toBeVisible({ timeout: 8000 });
      const proceedBtn = page.locator('button:has-text("Proceed to Dashboard")');
      if (await proceedBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
        await proceedBtn.click();
      }
    }
  } catch {
    // Checkin not required
  }
}

async function loginUser(page: any, user: any) {
  await page.context().clearCookies();
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto('/login');
    const emailInput = page.locator('input[type="email"]:not([disabled])');
    await expect(emailInput).toBeVisible({ timeout: 15000 });
    await emailInput.fill(user.email);
    await page.fill('input[type="password"]', user.pass);
    await page.click('button[type="submit"]');
    try {
      await page.waitForURL((url: any) => url.pathname.includes('/app'), { timeout: 25000 });
      if (user.expectedRoute.includes('/app/intern') || user.expectedRoute === '/app/dashboard') {
        await handleCheckinIfNeeded(page);
      }
      return;
    } catch (err) {
      if (attempt === 2) throw err;
      await page.waitForTimeout(1000);
    }
  }
}

test.describe('Phase 11 — Production PWA Installation Verification', () => {
  test.setTimeout(90000);

  test('1. Manifest & Assets: manifest.webmanifest and sw.js are valid and accessible', async ({ request }) => {
    // 1. Fetch manifest
    const manifestRes = await request.get('/manifest.webmanifest');
    expect(manifestRes.status()).toBe(200);
    const manifest = await manifestRes.json();

    expect(manifest.name).toContain('SCARO');
    expect(manifest.short_name).toBe('SCARO ERP');
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.background_color).toBe('#0f172a');
    expect(manifest.theme_color).toBe('#7B1113');

    // Verify icons
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
    const has192 = manifest.icons.some((i: any) => i.sizes.includes('192x192') && i.src.includes('scaro-logo.png'));
    const has512 = manifest.icons.some((i: any) => i.sizes.includes('512x512') && i.src.includes('scaro-logo.png'));
    expect(has192).toBe(true);
    expect(has512).toBe(true);

    // 2. Fetch icon assets
    const icon192Res = await request.get('/assets/scaro-logo.png');
    expect(icon192Res.status()).toBe(200);

    // 3. Fetch Service Worker
    const swRes = await request.get('/sw.js');
    expect(swRes.status()).toBe(200);
    const swContent = await swRes.text();
    expect(swContent).toContain('CACHE_NAME');
    expect(swContent).toContain('addEventListener');
  });

  test('2. Login Page: Displays "Install SCARO ERP" button and opens instructional modal', async ({ page }) => {
    await page.goto('/login');

    const installBtn = page.locator('#pwa-install-button, [data-testid="pwa-install-button"]');
    await expect(installBtn).toBeVisible({ timeout: 15000 });
    await expect(installBtn).toContainText('Install SCARO ERP');

    // Click install button -> opens PWA modal if beforeinstallprompt not triggered in headless test
    await installBtn.click();

    const modalTitle = page.locator('text=Install SCARO ERP');
    await expect(modalTitle.first()).toBeVisible({ timeout: 5000 });

    // Verify platform tabs
    const iosTab = page.locator('button:has-text("iOS / Safari")');
    const androidTab = page.locator('button:has-text("Android")');
    const desktopTab = page.locator('button:has-text("Desktop")');

    await expect(iosTab).toBeVisible();
    await expect(androidTab).toBeVisible();
    await expect(desktopTab).toBeVisible();

    // Click iOS tab -> verify Share & Add to Home Screen instructions
    await iosTab.click();
    await expect(page.locator('text=Add to Home Screen')).toBeVisible();
    await expect(page.locator('text=Share')).toBeVisible();

    // Click Android tab -> verify Chrome instructions
    await androidTab.click();
    await expect(page.locator('text=Install app or Add to Home screen')).toBeVisible();

    // Click Desktop tab -> verify Chrome / Edge address bar instructions
    await desktopTab.click();
    await expect(page.locator('text=look at the right side of the address bar')).toBeVisible();
  });

  test('3. Employee: Sees "Install SCARO ERP" button in authenticated navigation sidebar', async ({ page }) => {
    await loginUser(page, USERS.employee);

    const installBtn = page.locator('aside #pwa-install-button, aside [data-testid="pwa-install-button"]');
    await expect(installBtn).toBeVisible({ timeout: 15000 });
    await expect(installBtn).toContainText('Install SCARO ERP');

    await installBtn.click();
    await expect(page.locator('text=Install SCARO ERP').first()).toBeVisible({ timeout: 5000 });
  });

  test('4. Intern: Sees "Install SCARO ERP" button in authenticated navigation sidebar', async ({ page }) => {
    await loginUser(page, USERS.intern);

    const installBtn = page.locator('aside #pwa-install-button, aside [data-testid="pwa-install-button"]');
    await expect(installBtn).toBeVisible({ timeout: 15000 });
    await expect(installBtn).toContainText('Install SCARO ERP');

    await installBtn.click();
    await expect(page.locator('text=Install SCARO ERP').first()).toBeVisible({ timeout: 5000 });
  });

  // Mobile Viewport Tests
  const viewports = [
    { name: '360x800', width: 360, height: 800 },
    { name: '390x844', width: 390, height: 844 },
    { name: '414x896', width: 414, height: 896 }
  ];

  for (const vp of viewports) {
    test(`5. PWA Mobile Responsive Installation on ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/login');

      const installBtn = page.locator('#pwa-install-button');
      await expect(installBtn).toBeVisible({ timeout: 15000 });
      await expect(installBtn).toContainText('Install SCARO ERP');

      await installBtn.click();
      await expect(page.locator('text=Install SCARO ERP').first()).toBeVisible({ timeout: 5000 });
    });
  }
});
