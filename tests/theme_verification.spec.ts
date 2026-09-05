import { test, expect } from '@playwright/test';

const USERS = {
  admin: {
    email: 'kumar@scaro.in',
    pass: 'Scaro@Kumar2026!',
    expectedRoute: '/app/admin/overview'
  },
  employee: {
    email: 'madhan@scaro.in',
    pass: 'Scaro@Madhan2026!',
    expectedRoute: '/app/dashboard'
  },
  intern: {
    email: 'nikitha@scaro.in',
    pass: 'Scaro@Nikitha2026!',
    expectedRoute: '/app/intern/dashboard'
  }
};

const VIEWPORTS = [
  { name: 'Desktop (1280x800)', width: 1280, height: 800 },
  { name: 'Mobile Compact (360x800)', width: 360, height: 800 },
  { name: 'Mobile Standard (390x844)', width: 390, height: 844 },
  { name: 'Mobile Large (414x896)', width: 414, height: 896 }
];

test.describe('SCARO ERP — Theme System & Brand Color Verification', () => {
  test.setTimeout(90000);

  test('Login Page uses official SCARO Crimson/Burgundy brand theme and no legacy orange', async ({ page }) => {
    await page.goto('/login');

    // 1. Verify Logo is rendered cleanly
    const logo = page.locator('img[alt="SCARO Company Logo"]');
    await expect(logo).toBeVisible();

    // 2. Verify Brand Title color is SCARO Crimson (rgb(123, 17, 19))
    const title = page.locator('h1:has-text("SCARO ERP")');
    await expect(title).toBeVisible();
    const titleColor = await title.evaluate((el) => window.getComputedStyle(el).color);
    expect(titleColor).toBe('rgb(123, 17, 19)'); // #7B1113

    // 3. Verify Primary Sign In Button uses SCARO Crimson background and white text
    const signInBtn = page.locator('button[type="submit"]');
    await expect(signInBtn).toBeVisible();
    const btnBg = await signInBtn.evaluate((el) => window.getComputedStyle(el).backgroundColor);
    const btnColor = await signInBtn.evaluate((el) => window.getComputedStyle(el).color);
    expect(btnBg).toBe('rgb(123, 17, 19)'); // #7B1113
    expect(btnColor).toBe('rgb(255, 255, 255)'); // #FFFFFF

    // 4. Verify no element uses the old orange color (rgb(249, 115, 22))
    const oldOrangePresent = await page.evaluate(() => {
      const allEls = document.querySelectorAll('*');
      for (const el of allEls) {
        const style = window.getComputedStyle(el);
        if (style.backgroundColor === 'rgb(249, 115, 22)' || style.color === 'rgb(249, 115, 22)') {
          return true;
        }
      }
      return false;
    });
    expect(oldOrangePresent).toBe(false);
  });

  for (const vp of VIEWPORTS) {
    test(`Responsive Theme & Layout Check on ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/login');

      // Verify no horizontal scrolling/overflow
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(hasHorizontalScroll).toBe(false);

      // Verify PWA Install button styling
      const pwaBtn = page.locator('#pwa-install-button');
      await expect(pwaBtn).toBeVisible();
      const pwaColor = await pwaBtn.evaluate((el) => window.getComputedStyle(el).color);
      expect(pwaColor).toBe('rgb(123, 17, 19)');
    });
  }

  test('Authenticated Dashboard & Navigation Theme Consistency', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/login');

    const emailInput = page.locator('input[type="email"]:not([disabled])');
    await expect(emailInput).toBeVisible({ timeout: 15000 });
    await emailInput.fill(USERS.admin.email);
    await page.fill('input[type="password"]', USERS.admin.pass);
    await page.click('button[type="submit"]');

    await page.waitForURL((url) => url.pathname.includes('/app'), { timeout: 25000 });

    // Verify Sidebar brand header text color
    const brandName = page.locator('aside h2:has-text("SCARO")');
    await expect(brandName).toBeVisible();
    const brandColor = await brandName.evaluate((el) => window.getComputedStyle(el).color);
    expect(brandColor).toBe('rgb(123, 17, 19)');

    // Verify Active Navigation Link styling in sidebar
    const activeNavLink = page.locator('aside a.bg-primary\\/10');
    await expect(activeNavLink.first()).toBeVisible();
    const activeNavColor = await activeNavLink.first().evaluate((el) => window.getComputedStyle(el).color);
    expect(activeNavColor).toBe('rgb(123, 17, 19)');

    // Verify no legacy orange on dashboard
    const oldOrangeOnDashboard = await page.evaluate(() => {
      const allEls = document.querySelectorAll('*');
      for (const el of allEls) {
        const style = window.getComputedStyle(el);
        if (style.backgroundColor === 'rgb(249, 115, 22)' || style.color === 'rgb(249, 115, 22)') {
          return true;
        }
      }
      return false;
    });
    expect(oldOrangeOnDashboard).toBe(false);
  });
});
