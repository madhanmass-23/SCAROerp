import { test, expect } from '@playwright/test';

const USERS = {
  superAdmin: {
    name: 'Satish Kumar',
    email: 'satishkumar@scaro.in',
    pass: 'Scaro@SatishKumar2026!',
    role: 'Super Admin'
  },
  admin: {
    name: 'Kumar',
    email: 'kumar@scaro.in',
    pass: 'Scaro@Kumar2026!',
    role: 'Admin'
  },
  employee: {
    name: 'Madhan',
    email: 'madhan@scaro.in',
    pass: 'Scaro@Madhan2026!',
    role: 'Employee'
  },
  intern: {
    name: 'Nikitha',
    email: 'nikitha@scaro.in',
    pass: 'Scaro@Nikitha2026!',
    role: 'Intern'
  }
};

const VIEWPORTS = [
  { name: 'Desktop (1280x800)', width: 1280, height: 800 },
  { name: 'Mobile Compact (360x800)', width: 360, height: 800 },
  { name: 'Mobile Standard (390x844)', width: 390, height: 844 },
  { name: 'Mobile Large (414x896)', width: 414, height: 896 }
];

async function dismissDailyCheckinIfPresent(page: any) {
  const planTextarea = page.locator('textarea#plan');
  if (await planTextarea.isVisible({ timeout: 2000 }).catch(() => false)) {
    await planTextarea.fill('Working on daily assigned tasks and operational updates.');
    await page.click('button[type="submit"]:has-text("Submit Plan & Clock In")');
    const proceedBtn = page.locator('button:has-text("Proceed to Dashboard")');
    if (await proceedBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await proceedBtn.click();
    }
    await page.waitForLoadState('networkidle');
  }
}

async function loginAndNavigateToTasks(page: any, user: { email: string; pass: string }) {
  await page.goto('/login');
  await page.fill('input[type="email"]', user.email);
  await page.fill('input[type="password"]', user.pass);
  await page.click('button[type="submit"]');
  await page.waitForLoadState('networkidle');

  await dismissDailyCheckinIfPresent(page);

  await page.goto('/app/tasks');
  await page.waitForLoadState('networkidle');

  await dismissDailyCheckinIfPresent(page);
}

test.describe('SCARO ERP — Step 1B: Task Management UX & Daily Task Visibility', () => {
  test.setTimeout(90000);

  test('Employee Task Page: Two primary sections (My Tasks, Assigned by Manager), no Create Task button, due date filters', async ({ page }) => {
    await loginAndNavigateToTasks(page, USERS.employee);

    // 1. Verify Page Title
    await expect(page.locator('h1:has-text("Task Management")')).toBeVisible();

    // 2. Verify Employee Tabs
    const myTasksTab = page.locator('#tasks-tab-my-tasks');
    const assignedByManagerTab = page.locator('#tasks-tab-assigned-by-manager');
    const assignedByMeTab = page.locator('#tasks-tab-assigned-by-me');
    const allTasksTab = page.locator('#tasks-tab-all-tasks');

    await expect(myTasksTab).toBeVisible();
    await expect(myTasksTab).toHaveText('My Tasks');
    await expect(assignedByManagerTab).toBeVisible();
    await expect(assignedByManagerTab).toHaveText('Assigned by Manager');

    // Manager-only tabs must NOT exist for Employee
    await expect(assignedByMeTab).toHaveCount(0);
    await expect(allTasksTab).toHaveCount(0);

    // 3. Verify Create Task button is strictly hidden for Employee
    const createBtn = page.locator('#create-task-button');
    await expect(createBtn).toHaveCount(0);

    // 4. Verify Due Schedule Filter Dropdown
    const dueScheduleFilter = page.locator('#tasks-filter-due-date');
    await expect(dueScheduleFilter).toBeVisible();
    const options = await dueScheduleFilter.locator('option').allInnerTexts();
    expect(options).toContain('All Due Dates');
    expect(options).toContain('Due Today');
    expect(options).toContain('Overdue Only');
    expect(options).toContain('Upcoming / Future');

    // 5. Test switching to "Assigned by Manager"
    await assignedByManagerTab.click();
    await page.waitForLoadState('networkidle');
    await expect(assignedByManagerTab).toHaveClass(/border-primary/);

    // 6. Filter by Due Today and Overdue
    await dueScheduleFilter.selectOption('Due Today');
    await page.waitForTimeout(300);
    await dueScheduleFilter.selectOption('All');
  });

  test('Intern Task Page: Two primary sections (My Tasks, Assigned by Manager), no Create Task button', async ({ page }) => {
    await loginAndNavigateToTasks(page, USERS.intern);

    // 1. Verify Page Title
    await expect(page.locator('h1:has-text("Task Management")')).toBeVisible();

    // 2. Verify Intern Tabs
    const myTasksTab = page.locator('#tasks-tab-my-tasks');
    const assignedByManagerTab = page.locator('#tasks-tab-assigned-by-manager');
    const assignedByMeTab = page.locator('#tasks-tab-assigned-by-me');
    const allTasksTab = page.locator('#tasks-tab-all-tasks');

    await expect(myTasksTab).toBeVisible();
    await expect(myTasksTab).toHaveText('My Tasks');
    await expect(assignedByManagerTab).toBeVisible();
    await expect(assignedByManagerTab).toHaveText('Assigned by Manager');

    // Manager tabs must NOT exist
    await expect(assignedByMeTab).toHaveCount(0);
    await expect(allTasksTab).toHaveCount(0);

    // 3. Verify Create Task button is strictly hidden for Intern
    const createBtn = page.locator('#create-task-button');
    await expect(createBtn).toHaveCount(0);

    // 4. Test tab switching
    await assignedByManagerTab.click();
    await expect(assignedByManagerTab).toHaveClass(/border-primary/);
    await myTasksTab.click();
    await expect(myTasksTab).toHaveClass(/border-primary/);
  });

  test('Admin Task Page: Manager tabs (My Tasks, Assigned by Me, All Tasks), Create Task button, Dynamic Assignee Selector', async ({ page }) => {
    await loginAndNavigateToTasks(page, USERS.admin);

    // 1. Verify Manager Tabs
    const myTasksTab = page.locator('#tasks-tab-my-tasks');
    const assignedByMeTab = page.locator('#tasks-tab-assigned-by-me');
    const allTasksTab = page.locator('#tasks-tab-all-tasks');
    const assignedByManagerTab = page.locator('#tasks-tab-assigned-by-manager');

    await expect(myTasksTab).toBeVisible();
    await expect(assignedByMeTab).toBeVisible();
    await expect(allTasksTab).toBeVisible();
    await expect(assignedByManagerTab).toHaveCount(0);

    // 2. Verify Create Task button is visible
    const createBtn = page.locator('#create-task-button');
    await expect(createBtn).toBeVisible();

    // 3. Open Create Task Modal
    await createBtn.click();
    await expect(page.getByRole('heading', { name: 'Create New Task' })).toBeVisible();

    // 4. Open Assign To Selector
    const assignTrigger = page.locator('#assign-to-selector-trigger');
    await expect(assignTrigger).toBeVisible();
    await assignTrigger.click();

    // 5. Verify dynamic active employees & interns appear in the list
    const searchInput = page.locator('#assignee-search-input');
    await expect(searchInput).toBeVisible();

    // Employee Madhan and Intern Nikitha should be listed dynamically with unique test IDs
    await expect(page.locator('text=Employees')).toBeVisible();
    await expect(page.locator('#assignee-option-madhan')).toBeVisible();
    await expect(page.locator('text=Interns')).toBeVisible();
    await expect(page.locator('#assignee-option-nikitha')).toBeVisible();
  });

  test('Super Admin Task Page: Manager tabs, Create Task button, Dynamic Assignee Selector', async ({ page }) => {
    await loginAndNavigateToTasks(page, USERS.superAdmin);

    // 1. Verify Manager Tabs
    await expect(page.locator('#tasks-tab-my-tasks')).toBeVisible();
    await expect(page.locator('#tasks-tab-assigned-by-me')).toBeVisible();
    await expect(page.locator('#tasks-tab-all-tasks')).toBeVisible();

    // 2. Verify Create Task Button
    const createBtn = page.locator('#create-task-button');
    await expect(createBtn).toBeVisible();

    // 3. Open Create Task Modal & Check Assignee Selector
    await createBtn.click();
    await expect(page.getByRole('heading', { name: 'Create New Task' })).toBeVisible();
    const assignTrigger = page.locator('#assign-to-selector-trigger');
    await expect(assignTrigger).toBeVisible();
    await assignTrigger.click();

    await expect(page.locator('#assignee-search-input')).toBeVisible();
    await expect(page.locator('text=Employees')).toBeVisible();
    await expect(page.locator('#assignee-option-madhan')).toBeVisible();
    await expect(page.locator('text=Interns')).toBeVisible();
    await expect(page.locator('#assignee-option-nikitha')).toBeVisible();
  });

  for (const vp of VIEWPORTS) {
    test(`Responsive Task Management Layout on ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await loginAndNavigateToTasks(page, USERS.employee);

      // 1. Check no horizontal page blowout
      const hasHorizontalOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(hasHorizontalOverflow).toBe(false);

      // 2. Verify tabs are visible and clickable
      const myTasksTab = page.locator('#tasks-tab-my-tasks');
      const assignedByManagerTab = page.locator('#tasks-tab-assigned-by-manager');
      await expect(myTasksTab).toBeVisible();
      await expect(assignedByManagerTab).toBeVisible();

      await assignedByManagerTab.click();
      await expect(assignedByManagerTab).toHaveClass(/border-primary/);

      // 3. Verify Filter bar is responsive and usable
      const filterDue = page.locator('#tasks-filter-due-date');
      await expect(filterDue).toBeVisible();
      const filterSearch = page.locator('#tasks-search-input');
      await expect(filterSearch).toBeVisible();
    });
  }
});
