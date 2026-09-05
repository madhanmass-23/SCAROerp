import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { getTimeGreeting } from '../src/utils/greeting';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env.admin.local') });
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const adminSupabase = createClient(supabaseUrl, serviceKey);

const USERS = {
  employee: {
    name: 'Madhan',
    email: 'madhan@scaro.in',
    pass: 'Scaro@Madhan2026!',
    expectedName: 'Madhan',
    role: 'Employee'
  },
  intern: {
    name: 'Nikitha',
    email: 'nikitha@scaro.in',
    pass: 'Scaro@Nikitha2026!',
    expectedName: 'Nikitha',
    role: 'Intern'
  }
};

test.describe('SCARO ERP — Time-Based Greeting Unit & Boundary Verification', () => {
  test('evaluates all required time windows and boundary edges accurately', () => {
    // 05:00–11:59 -> Good Morning
    const morningEarly = new Date();
    morningEarly.setHours(5, 0, 0, 0);
    expect(getTimeGreeting(morningEarly)).toBe('Good Morning');

    const morningStandard = new Date();
    morningStandard.setHours(8, 30, 0, 0);
    expect(getTimeGreeting(morningStandard)).toBe('Good Morning');

    const morningLate = new Date();
    morningLate.setHours(11, 59, 59, 999);
    expect(getTimeGreeting(morningLate)).toBe('Good Morning');

    // 12:00–16:59 -> Good Afternoon
    const afternoonStart = new Date();
    afternoonStart.setHours(12, 0, 0, 0);
    expect(getTimeGreeting(afternoonStart)).toBe('Good Afternoon');

    const afternoonStandard = new Date();
    afternoonStandard.setHours(13, 15, 0, 0);
    expect(getTimeGreeting(afternoonStandard)).toBe('Good Afternoon');

    const afternoonLate = new Date();
    afternoonLate.setHours(16, 59, 59, 999);
    expect(getTimeGreeting(afternoonLate)).toBe('Good Afternoon');

    // 17:00–20:59 -> Good Evening
    const eveningStart = new Date();
    eveningStart.setHours(17, 0, 0, 0);
    expect(getTimeGreeting(eveningStart)).toBe('Good Evening');

    const eveningStandard = new Date();
    eveningStandard.setHours(18, 45, 0, 0);
    expect(getTimeGreeting(eveningStandard)).toBe('Good Evening');

    const eveningLate = new Date();
    eveningLate.setHours(20, 59, 59, 999);
    expect(getTimeGreeting(eveningLate)).toBe('Good Evening');

    // 21:00–04:59 -> Good Night
    const nightStart = new Date();
    nightStart.setHours(21, 0, 0, 0);
    expect(getTimeGreeting(nightStart)).toBe('Good Night');

    const nightStandard = new Date();
    nightStandard.setHours(22, 30, 0, 0);
    expect(getTimeGreeting(nightStandard)).toBe('Good Night');

    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    expect(getTimeGreeting(midnight)).toBe('Good Night');

    const lateNight = new Date();
    lateNight.setHours(2, 0, 0, 0);
    expect(getTimeGreeting(lateNight)).toBe('Good Night');

    const nightLate = new Date();
    nightLate.setHours(4, 59, 59, 999);
    expect(getTimeGreeting(nightLate)).toBe('Good Night');
  });
});

test.describe('SCARO ERP — Dynamic Greeting E2E UI & Viewport Verification', () => {
  test.setTimeout(90000);

  // Helper to clear existing daily reports for today to trigger check-in modal
  async function resetDailyReportForUser(email: string) {
    if (!serviceKey) return;
    const { data: profile } = await adminSupabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .single();

    if (profile?.id) {
      const todayStr = new Date().toISOString().split('T')[0];
      await adminSupabase
        .from('daily_reports')
        .delete()
        .eq('user_id', profile.id)
        .eq('report_date', todayStr);
    }
  }

  async function loginUser(page: any, user: typeof USERS.intern) {
    await resetDailyReportForUser(user.email);
    await page.context().clearCookies();
    await page.goto('/login');

    const emailInput = page.locator('input[type="email"]:not([disabled])');
    await expect(emailInput).toBeVisible({ timeout: 15000 });
    await emailInput.fill(user.email);
    await page.fill('input[type="password"]', user.pass);
    await page.click('button[type="submit"]');

    const greetingLocator = page.locator('[data-testid="daily-checkin-greeting"]');
    await expect(greetingLocator).toBeVisible({ timeout: 25000 });
    return greetingLocator;
  }

  // Set browser system time in page and trigger greeting interval update
  async function setMockDeviceTime(page: any, targetHours: number, targetMinutes: number = 0) {
    await page.evaluate(({ h, m }: { h: number; m: number }) => {
      const OriginalDate = window.Date;
      const fixedDate = new OriginalDate();
      fixedDate.setHours(h, m, 0, 0);
      const timeOffset = fixedDate.getTime() - OriginalDate.now();

      class MockDate extends OriginalDate {
        constructor(...args: any[]) {
          if (args.length === 0) {
            super(OriginalDate.now() + timeOffset);
          } else {
            // @ts-ignore
            super(...args);
          }
        }
        static override now() {
          return OriginalDate.now() + timeOffset;
        }
      }
      window.Date = MockDate as any;
    }, { h: targetHours, m: targetMinutes });

    // Wait for the 1-second dynamic interval to tick and update DOM
    await page.waitForTimeout(1200);
  }

  test('Morning greeting (08:30) for Intern across 1280x800', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const greetingEl = await loginUser(page, USERS.intern);
    await setMockDeviceTime(page, 8, 30);
    await expect(greetingEl).toHaveText('Good Morning, Nikitha!');
  });

  test('Afternoon greeting (13:15) for Employee across 360x800', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    const greetingEl = await loginUser(page, USERS.employee);
    await setMockDeviceTime(page, 13, 15);
    await expect(greetingEl).toHaveText('Good Afternoon, Madhan!');
  });

  test('Evening greeting (18:45) for Intern across 390x844', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const greetingEl = await loginUser(page, USERS.intern);
    await setMockDeviceTime(page, 18, 45);
    await expect(greetingEl).toHaveText('Good Evening, Nikitha!');
  });

  test('Night greeting (22:30 & 02:00) for Intern across 414x896', async ({ page }) => {
    await page.setViewportSize({ width: 414, height: 896 });
    const greetingEl = await loginUser(page, USERS.intern);

    // 22:30 Night check
    await setMockDeviceTime(page, 22, 30);
    await expect(greetingEl).toHaveText('Good Night, Nikitha!');

    // 02:00 Night check
    await setMockDeviceTime(page, 2, 0);
    await expect(greetingEl).toHaveText('Good Night, Nikitha!');
  });

  test('Automatic time transition without logout/login or refresh', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const greetingEl = await loginUser(page, USERS.intern);

    // Set to Morning (11:59)
    await setMockDeviceTime(page, 11, 59);
    await expect(greetingEl).toHaveText('Good Morning, Nikitha!');

    // Cross boundary to Afternoon (12:00) without page reload
    await setMockDeviceTime(page, 12, 0);
    await expect(greetingEl).toHaveText('Good Afternoon, Nikitha!');

    // Cross boundary to Evening (17:00) without page reload
    await setMockDeviceTime(page, 17, 0);
    await expect(greetingEl).toHaveText('Good Evening, Nikitha!');

    // Cross boundary to Night (21:00) without page reload
    await setMockDeviceTime(page, 21, 0);
    await expect(greetingEl).toHaveText('Good Night, Nikitha!');
  });
});
