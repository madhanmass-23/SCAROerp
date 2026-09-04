import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env.admin.local') });
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const adminSupabase = createClient(supabaseUrl, serviceKey);

const USERS = {
  superAdmin: {
    name: 'Satish Kumar',
    email: 'satishkumar@scaro.com',
    pass: 'Scaro@SatishKumar2026!',
    expectedRoute: '/app/admin/dashboard',
    role: 'Super Admin'
  },
  admin: {
    name: 'Kumar',
    email: 'kumar@scaro.com',
    pass: 'Scaro@Kumar2026!',
    expectedRoute: '/app/admin/overview',
    role: 'Admin'
  },
  employee: {
    name: 'Madhan',
    email: 'madhan@scaro.com',
    pass: 'Scaro@Madhan2026!',
    expectedRoute: '/app/dashboard',
    role: 'Employee'
  },
  intern: {
    name: 'Maheswari',
    email: 'maheswari@scaro.com',
    pass: 'Scaro@Maheswari2026!',
    expectedRoute: '/app/intern/dashboard',
    role: 'Intern'
  }
};

async function handleCheckinIfNeeded(page: any, planText = 'Focusing on targeted UX and chat verification today') {
  try {
    const planBox = page.locator('textarea#plan, textarea[placeholder*="Outline the key tasks"]');
    const isVisible = await planBox.waitFor({ state: 'visible', timeout: 4000 }).then(() => true).catch(() => false);
    if (isVisible) {
      await planBox.fill(planText);
      await page.click('button:has-text("Submit Plan & Clock In")');
      await expect(page.locator('text=Today\'s plan saved.')).toBeVisible({ timeout: 8000 });
      const proceedBtn = page.locator('button:has-text("Proceed to Dashboard")');
      if (await proceedBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
        await proceedBtn.click();
      }
    }
  } catch {
    // Checkin not required or already handled
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

async function logoutUser(page: any) {
  await page.context().clearCookies();
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  }).catch(() => {});
}

test.describe('SCARO ERP — Targeted Chat, People, Meetings & Task UX Verification', () => {
  test.setTimeout(90000);

  // =========================================================================
  // 1. PEOPLE ACCESS RESTRICTIONS
  // =========================================================================
  test('People Directory: Employee direct navigation is BLOCKED and hidden from navigation', async ({ page }) => {
    await loginUser(page, USERS.employee);

    // 1. Desktop sidebar should not have People link
    const peopleSidebarLink = page.locator('aside a[href="/app/people"]');
    await expect(peopleSidebarLink).not.toBeVisible();

    // 2. Direct URL navigation to /app/people should be blocked and redirected
    await page.goto('/app/people');
    await page.waitForURL((url) => !url.pathname.includes('/app/people'), { timeout: 25000 });
    expect(page.url()).not.toContain('/app/people');
  });

  test('People Directory: Intern direct navigation is BLOCKED and hidden from navigation', async ({ page }) => {
    await loginUser(page, USERS.intern);

    // 1. Desktop sidebar should not have People link
    const peopleSidebarLink = page.locator('aside a[href="/app/people"]');
    await expect(peopleSidebarLink).not.toBeVisible();

    // 2. Direct URL navigation to /app/people should be blocked and redirected
    await page.goto('/app/people');
    await page.waitForURL((url) => !url.pathname.includes('/app/people'), { timeout: 25000 });
    expect(page.url()).not.toContain('/app/people');
  });

  test('People Directory: Admin and Super Admin have full access', async ({ page }) => {
    await loginUser(page, USERS.admin);
    await page.goto('/app/people');
    await expect(page.locator('main h1')).toContainText(/People/i, { timeout: 25000 });

    await logoutUser(page);

    await loginUser(page, USERS.superAdmin);
    await page.goto('/app/people');
    await expect(page.locator('main h1')).toContainText(/People/i, { timeout: 25000 });
  });

  // =========================================================================
  // 2. MESSAGES: DIRECT 1-TO-1, CONTACT SEARCH & PERSISTENCE
  // =========================================================================
  test('Messages: Employee can view authorized contacts and dynamically search by name/email', async ({ page }) => {
    await loginUser(page, USERS.employee);
    await page.goto('/app/messages');

    // Verify Contacts list is visible with authorized company members by default
    const contactsList = page.locator('[data-testid="contacts-list"]');
    await expect(contactsList).toBeVisible({ timeout: 15000 });

    // Should list contacts without searching
    const contactItems = page.locator('[data-testid^="contact-item-"]');
    await expect(contactItems.first()).toBeVisible({ timeout: 10000 });
    const count = await contactItems.count();
    expect(count).toBeGreaterThan(0);

    // Dynamic search by name
    const searchInput = page.locator('[data-testid="messages-search-input"]');
    await searchInput.fill('Kumar');

    const filteredByName = page.locator('[data-testid^="contact-item-"]');
    await expect(filteredByName.first()).toContainText(/Kumar/i);
    const filteredCount = await filteredByName.count();
    expect(filteredCount).toBeGreaterThan(0);

    // Dynamic search by email
    await searchInput.fill('maheswari@scaro.com');
    const filteredByEmail = page.locator('#contact-maheswari');
    await expect(filteredByEmail).toBeVisible();
    await expect(filteredByEmail).toContainText(/Maheswari/i);
  });

  test('Messages: Intern can view contacts and dynamically search', async ({ page }) => {
    await loginUser(page, USERS.intern);
    await page.goto('/app/messages');

    const contactsList = page.locator('[data-testid="contacts-list"]');
    await expect(contactsList).toBeVisible({ timeout: 15000 });

    // Dynamic search for Employee Madhan
    const searchInput = page.locator('[data-testid="messages-search-input"]');
    await searchInput.fill('Madhan');

    const filtered = page.locator('#contact-madhan');
    await expect(filtered).toBeVisible();
    await expect(filtered).toContainText(/Madhan/i);
  });

  test('Messages: 1-to-1 direct chat persistence between Admin and Intern', async ({ page }) => {
    const testMessageContent = `Test message from Admin to Intern at ${Date.now()}`;

    // 1. Admin sends message to Intern Maheswari
    await loginUser(page, USERS.admin);
    await page.goto('/app/messages');

    // Find and select Intern Maheswari
    const internContact = page.locator('#contact-maheswari');
    await expect(internContact).toBeVisible({ timeout: 10000 });
    await internContact.click();

    // Verify Chat panel is open
    const messageInput = page.locator('[data-testid="message-input"]');
    await expect(messageInput).toBeVisible({ timeout: 10000 });
    await messageInput.fill(testMessageContent);
    await page.click('[data-testid="send-message-btn"]');

    // Verify message appears in conversation
    await expect(page.locator('[data-testid="chat-messages-container"]').locator(`text="${testMessageContent}"`)).toBeVisible({ timeout: 10000 });

    await logoutUser(page);

    // 2. Intern logs in and verifies receiving the message
    await loginUser(page, USERS.intern);
    await page.goto('/app/messages');

    // Click on Admin Kumar in contacts list
    const adminContact = page.locator('#contact-kumar');
    await expect(adminContact).toBeVisible({ timeout: 10000 });
    await adminContact.click();

    // Verify received message content is visible in conversation
    await expect(page.locator('[data-testid="chat-messages-container"]').locator(`text="${testMessageContent}"`)).toBeVisible({ timeout: 10000 });

    // 3. Intern replies to Admin
    const replyContent = `Reply from Intern at ${Date.now()}`;
    await page.fill('[data-testid="message-input"]', replyContent);
    await page.click('[data-testid="send-message-btn"]');
    await expect(page.locator('[data-testid="chat-messages-container"]').locator(`text="${replyContent}"`)).toBeVisible({ timeout: 10000 });
  });

  // =========================================================================
  // 3. MOBILE CHAT FLOW: Contacts → Chat → Back across Viewports
  // =========================================================================
  const mobileViewports = [
    { name: '360x800', width: 360, height: 800 },
    { name: '390x844', width: 390, height: 844 },
    { name: '414x896', width: 414, height: 896 },
  ];

  for (const vp of mobileViewports) {
    test(`Mobile Chat Flow: Contacts → Chat → Back on ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await loginUser(page, USERS.employee);
      await page.goto('/app/messages');

      // 1. Initial Mobile View: Contacts list is visible, Chat panel is hidden
      const contactsList = page.locator('[data-testid="contacts-list"]');
      await expect(contactsList).toBeVisible({ timeout: 15000 });
      const chatPanel = page.locator('#messages-chat-panel');
      await expect(chatPanel).toBeHidden();

      // 2. Click a contact: opens Chat panel, Contacts list becomes hidden
      const firstContact = page.locator('[data-testid^="contact-item-"]').first();
      await firstContact.click();

      await expect(chatPanel).toBeVisible({ timeout: 10000 });
      await expect(contactsList).toBeHidden();

      // 3. Back Button in Chat Header
      const backButton = page.locator('[data-testid="back-to-contacts-btn"]');
      await expect(backButton).toBeVisible();
      await backButton.click();

      // 4. Back to Contacts: Contacts list visible again, Chat hidden
      await expect(contactsList).toBeVisible({ timeout: 10000 });
      await expect(chatPanel).toBeHidden();
    });
  }

  // =========================================================================
  // 4. MEETINGS PERMISSIONS
  // =========================================================================
  test('Meetings: Intern is BLOCKED from creating meetings (UI & DB)', async ({ page }) => {
    await loginUser(page, USERS.intern);
    await page.goto('/app/meetings');

    // 1. UI: Schedule Meeting button must NOT be visible for Intern
    const scheduleBtn = page.locator('#schedule-meeting-button, [data-testid="schedule-meeting-button"]');
    await expect(scheduleBtn).not.toBeVisible();

    // 2. Database level check: directly inserting meeting with Intern session must fail via trigger
    const pubKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
    const internClient = createClient(supabaseUrl, pubKey);
    const { error: signInErr } = await internClient.auth.signInWithPassword({
      email: USERS.intern.email,
      password: USERS.intern.pass,
    });
    expect(signInErr).toBeNull();

    const { error: insertErr } = await internClient
      .from('meetings')
      .insert({
        title: 'Unauthorized Intern Meeting Test',
        meeting_date: new Date().toISOString().split('T')[0],
        start_time: '10:00:00',
        end_time: '11:00:00'
      });

    expect(insertErr).not.toBeNull();
    expect(insertErr?.message).toMatch(/violates row-level security policy|Interns are not permitted/i);
  });

  test('Meetings: Employee, Admin, Super Admin are ALLOWED to create meetings', async ({ page }) => {
    // 1. Employee
    await loginUser(page, USERS.employee);
    await page.goto('/app/meetings');
    await handleCheckinIfNeeded(page);
    const empScheduleBtn = page.locator('[data-testid="schedule-meeting-button"]');
    await expect(empScheduleBtn).toBeVisible({ timeout: 15000 });

    await logoutUser(page);

    // 2. Admin
    await loginUser(page, USERS.admin);
    await page.goto('/app/meetings');
    const adminScheduleBtn = page.locator('[data-testid="schedule-meeting-button"]');
    await expect(adminScheduleBtn).toBeVisible({ timeout: 15000 });

    await logoutUser(page);

    // 3. Super Admin
    await loginUser(page, USERS.superAdmin);
    await page.goto('/app/meetings');
    const superScheduleBtn = page.locator('[data-testid="schedule-meeting-button"]');
    await expect(superScheduleBtn).toBeVisible({ timeout: 15000 });
  });

  // =========================================================================
  // 5. TASKS PERMISSIONS & TABS
  // =========================================================================
  test('Tasks: Employee and Intern see My Tasks & Assigned by Manager; Create Task is BLOCKED', async ({ page }) => {
    // 1. Employee
    await loginUser(page, USERS.employee);
    await page.goto('/app/tasks');

    await expect(page.locator('[data-testid="tasks-tab-my-tasks"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="tasks-tab-assigned-by-manager"]')).toBeVisible();
    await expect(page.locator('[data-testid="tasks-tab-assigned-by-me"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="tasks-tab-all-tasks"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="create-task-button"]')).not.toBeVisible();

    await logoutUser(page);

    // 2. Intern
    await loginUser(page, USERS.intern);
    await page.goto('/app/tasks');

    await expect(page.locator('[data-testid="tasks-tab-my-tasks"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="tasks-tab-assigned-by-manager"]')).toBeVisible();
    await expect(page.locator('[data-testid="tasks-tab-assigned-by-me"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="tasks-tab-all-tasks"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="create-task-button"]')).not.toBeVisible();
  });

  test('Tasks: Admin and Super Admin see My Tasks, Assigned by Me, All Tasks; Create Task is PASS', async ({ page }) => {
    // 1. Admin
    await loginUser(page, USERS.admin);
    await page.goto('/app/tasks');

    await expect(page.locator('[data-testid="tasks-tab-my-tasks"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="tasks-tab-assigned-by-me"]')).toBeVisible();
    await expect(page.locator('[data-testid="tasks-tab-all-tasks"]')).toBeVisible();
    await expect(page.locator('[data-testid="create-task-button"]')).toBeVisible();

    await logoutUser(page);

    // 2. Super Admin
    await loginUser(page, USERS.superAdmin);
    await page.goto('/app/tasks');

    await expect(page.locator('[data-testid="tasks-tab-my-tasks"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="tasks-tab-assigned-by-me"]')).toBeVisible();
    await expect(page.locator('[data-testid="tasks-tab-all-tasks"]')).toBeVisible();
    await expect(page.locator('[data-testid="create-task-button"]')).toBeVisible();
  });

  // =========================================================================
  // 6. DYNAMIC ASSIGN TO: Admin & Super Admin assign to Employee and Intern
  // =========================================================================
  test('Task Assignment: Admin can dynamically select and assign task to Employee and Intern', async ({ page }) => {
    await loginUser(page, USERS.admin);
    await page.goto('/app/tasks');

    // Click Create Task
    await page.click('[data-testid="create-task-button"]');
    await expect(page.locator('[data-testid="task-title-input"]')).toBeVisible({ timeout: 10000 });

    // Open Assign To dropdown
    const assigneeSelectBtn = page.locator('#assign-to-selector-trigger, [data-testid="assign-to-selector-trigger"]');
    await assigneeSelectBtn.click();

    // Verify searchable selection is open
    const searchInput = page.locator('[data-testid="assignee-search-input"]');
    await expect(searchInput).toBeVisible();

    // Filter for Employee
    await searchInput.fill('Madhan');
    const empOption = page.locator('[data-testid="assignee-option-madhan"]');
    await expect(empOption).toBeVisible();
    await expect(empOption).toContainText('Employee');

    // Filter for Intern
    await searchInput.fill('Maheswari');
    const internOption = page.locator('[data-testid="assignee-option-maheswari"]');
    await expect(internOption).toBeVisible();
    await expect(internOption).toContainText('Intern');

    // Select Intern
    await internOption.click();
    await expect(assigneeSelectBtn).toContainText('Maheswari');
  });

  test('Task Assignment: Super Admin can dynamically select and assign task to Employee and Intern', async ({ page }) => {
    await loginUser(page, USERS.superAdmin);
    await page.goto('/app/tasks');

    await page.click('[data-testid="create-task-button"]');
    await expect(page.locator('[data-testid="task-title-input"]')).toBeVisible({ timeout: 10000 });

    const assigneeSelectBtn = page.locator('#assign-to-selector-trigger, [data-testid="assign-to-selector-trigger"]');
    await assigneeSelectBtn.click();

    const searchInput = page.locator('[data-testid="assignee-search-input"]');
    await expect(searchInput).toBeVisible();

    // Filter for Employee
    await searchInput.fill('Madhan');
    const empOption = page.locator('[data-testid="assignee-option-madhan"]');
    await expect(empOption).toBeVisible();
    await expect(empOption).toContainText('Employee');

    // Select Employee
    await empOption.click();
    await expect(assigneeSelectBtn).toContainText('Madhan');
  });
});
