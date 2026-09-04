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
    expectedRoute: '/app/admin/dashboard'
  },
  admin: {
    name: 'Kumar',
    email: 'kumar@scaro.com',
    pass: 'Scaro@Kumar2026!',
    expectedRoute: '/app/admin/overview'
  },
  employee: {
    name: 'Madhan',
    email: 'madhan@scaro.com',
    pass: 'Scaro@Madhan2026!',
    expectedRoute: '/app/dashboard'
  },
  intern: {
    name: 'Maheswari',
    email: 'maheswari@scaro.com',
    pass: 'Scaro@Maheswari2026!',
    expectedRoute: '/app/intern/dashboard'
  }
};

async function handleCheckinIfNeeded(page: any, planText = 'Focusing on operational task assignments today') {
  try {
    const planBox = page.locator('textarea#plan, textarea[placeholder*="Outline the key tasks"]');
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
      await page.waitForURL((url: any) => url.pathname.includes('/app'), { timeout: 25000 });
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
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto('/login');
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
}

test.describe('SCARO ERP — Phase 10 Final: Company Logo + Task Assignment UX', () => {
  test.setTimeout(90000);

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.reload();
  });

  test.beforeAll(async () => {
    // Ensure an active test project exists in DB for task assignments
    const { data: adminProfile } = await adminSupabase
      .from('profiles')
      .select('id')
      .eq('email', USERS.admin.email)
      .single();

    if (adminProfile) {
      const { data: existingProjects } = await adminSupabase
        .from('projects')
        .select('id')
        .eq('name', 'SCARO Enterprise Operations');

      if (!existingProjects || existingProjects.length === 0) {
        const { data: newProj } = await adminSupabase
          .from('projects')
          .insert({
            name: 'SCARO Enterprise Operations',
            description: 'Core company project for operational task allocations',
            status: 'Active',
            created_by: adminProfile.id,
            owner_id: adminProfile.id
          })
          .select()
          .single();

        if (newProj) {
          await adminSupabase.from('project_members').insert({
            project_id: newProj.id,
            user_id: adminProfile.id
          });
        }
      }
    }
  });

  // ==========================================================================
  // 1. COMPANY LOGO VERIFICATION ACROSS VIEWPORTS
  // ==========================================================================
  const viewports = [
    { name: 'Desktop (1280x800)', width: 1280, height: 800 },
    { name: 'Android Small (360x800)', width: 360, height: 800 },
    { name: 'iPhone 13/14 (390x844)', width: 390, height: 844 },
    { name: 'iPhone XR (414x896)', width: 414, height: 896 }
  ];

  for (const vp of viewports) {
    test(`1. Logo Branding on /login (${vp.name})`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/login');

      // 1. Logo image visible and sharp
      const logoImg = page.locator('img[alt="SCARO Company Logo"]');
      await expect(logoImg).toBeVisible({ timeout: 10000 });

      // Verify image natural dimensions (loaded successfully, not broken)
      const isLoaded = await logoImg.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0);
      expect(isLoaded).toBe(true);

      const dimensions = await logoImg.evaluate((img: HTMLImageElement) => ({
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        renderedWidth: img.clientWidth,
        renderedHeight: img.clientHeight
      }));
      expect(dimensions.naturalWidth).toBeGreaterThanOrEqual(100);
      expect(dimensions.naturalHeight).toBeGreaterThanOrEqual(100);
      // Aspect ratio must be 1:1
      expect(dimensions.naturalWidth).toBe(dimensions.naturalHeight);

      // 2. Install App button contains logo
      const installBtn = page.locator('[data-testid="pwa-install-button"]');
      await expect(installBtn).toBeVisible();
      const installLogo = installBtn.locator('img[alt="SCARO"]');
      await expect(installLogo).toBeVisible();

      // 3. Click install button to open modal, verify modal header has logo
      await installBtn.click();
      const modal = page.locator('div[role="dialog"]');
      await expect(modal).toBeVisible();
      await expect(modal.locator('img[alt="SCARO Logo"]')).toBeVisible();

      // Close modal
      await modal.locator('button:has-text("Got it")').click();
      await expect(modal).not.toBeVisible();
    });
  }

  test('2. Logo Branding in Sidebar & Mobile Navigation', async ({ page }) => {
    // Desktop Sidebar Logo
    await page.setViewportSize({ width: 1280, height: 800 });
    await loginUser(page, USERS.admin);

    const sidebarLogo = page.locator('aside img[alt="SCARO Logo"]');
    await expect(sidebarLogo).toBeVisible({ timeout: 10000 });
    await expect(page.locator('aside h2:has-text("SCARO")')).toBeVisible();
    await expect(page.locator('aside p:has-text("Enterprise ERP")')).toBeVisible();

    // Mobile Drawer Logo
    await page.setViewportSize({ width: 390, height: 844 });
    const bottomNav = page.locator('nav[aria-label="Mobile Bottom Navigation"]');
    await expect(bottomNav).toBeVisible({ timeout: 15000 });
    await bottomNav.locator('text=More').click();

    const drawer = page.locator('div[role="dialog"]');
    await expect(drawer).toBeVisible();
    await expect(drawer.locator('img[alt="SCARO Logo"]')).toBeVisible();
    await expect(drawer.locator('text=Workspace Navigation')).toBeVisible();

    await logoutUser(page);
  });

  // ==========================================================================
  // 2. ADMIN TASK CREATION WITH USER SELECTOR & RESTRICTION
  // ==========================================================================
  test('3. Admin Task Assignment Flow with Searchable Selector & Persistence', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await loginUser(page, USERS.admin);

    await page.goto('/app/tasks');
    await expect(page.locator('text=Task Management')).toBeVisible({ timeout: 15000 });

    // Verify "Create Task" button exists for Admin
    const createBtn = page.locator('[data-testid="create-task-button"]');
    await expect(createBtn).toBeVisible();
    await createBtn.click();

    // Verify Create Task modal opens
    const modal = page.locator('div[role="dialog"]');
    await expect(modal).toBeVisible();
    await expect(modal.locator('h3:has-text("Create New Task")')).toBeVisible();

    // Fill Title & Description
    await modal.locator('[data-testid="task-title-input"]').fill('Phase 10 Admin Assigned Task to Madhan');
    await modal.locator('[data-testid="task-description-input"]').fill('Testing real task assignment selector and persistence');

    // Open "Assign To" selector
    const selectorTrigger = modal.locator('[data-testid="assign-to-selector-trigger"]');
    await expect(selectorTrigger).toBeVisible();
    await selectorTrigger.click();

    // Verify Employees and Interns loaded from live DB
    await expect(modal.locator('text=Employees (')).toBeVisible({ timeout: 8000 });
    await expect(modal.locator('text=Interns (')).toBeVisible({ timeout: 8000 });

    // Verify specific active users appear with role badges
    await expect(modal.locator('[data-testid="assignee-option-madhan"]')).toBeVisible();
    await expect(modal.locator('[data-testid="assignee-option-maheswari"]')).toBeVisible();

    // Search for "Madhan"
    const searchInput = modal.locator('[data-testid="assignee-search-input"]');
    await searchInput.fill('Madhan');
    await expect(modal.locator('[data-testid="assignee-option-madhan"]')).toBeVisible();
    await expect(modal.locator('[data-testid="assignee-option-maheswari"]')).not.toBeVisible();

    // Select Madhan
    await modal.locator('[data-testid="assignee-option-madhan"]').click();

    // Check Project Membership validation (Phase 8 Restriction)
    const enrollBtn = modal.locator('[data-testid="enroll-assignee-button"]');
    const submitBtn = modal.locator('[data-testid="submit-create-task-button"]');

    if (await enrollBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
      // If Madhan was not yet enrolled in project, warning must be present and submit disabled
      await expect(modal.locator('[data-testid="project-membership-warning"]')).toBeVisible();
      await expect(submitBtn).toBeDisabled();

      // Click "Add Madhan to Project Team"
      await enrollBtn.click();
      await expect(enrollBtn).not.toBeVisible({ timeout: 8000 });
    }

    // Now submit button must be enabled
    await expect(submitBtn).toBeEnabled();

    // Set Priority & Status
    await modal.locator('[data-testid="task-priority-select"]').selectOption('High');
    await modal.locator('[data-testid="task-status-select"]').selectOption('Todo');

    // Submit Task Creation
    await submitBtn.click();
    await expect(modal).not.toBeVisible({ timeout: 10000 });

    // Switch to "Assigned by Me" tab to view assigned task
    await page.locator('[data-testid="tasks-tab-assigned-by-me"]').click();

    // Verify task appears in task list with assignee Madhan
    await expect(page.locator('text=Phase 10 Admin Assigned Task to Madhan')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('span:has-text("Madhan")')).toBeVisible();

    // Reload page to verify persistence from DB
    await page.reload();
    await page.locator('[data-testid="tasks-tab-assigned-by-me"]').click();
    await expect(page.locator('text=Phase 10 Admin Assigned Task to Madhan')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('span:has-text("Madhan")')).toBeVisible();

    await logoutUser(page);
  });

  // ==========================================================================
  // 3. SUPER ADMIN TASK CREATION WITH INTERN ASSIGNMENT
  // ==========================================================================
  test('4. Super Admin Task Assignment Flow to Intern (Maheswari)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await loginUser(page, USERS.superAdmin);

    await page.goto('/app/tasks');
    await expect(page.locator('text=Task Management')).toBeVisible({ timeout: 15000 });

    const createBtn = page.locator('[data-testid="create-task-button"]');
    await expect(createBtn).toBeVisible();
    await createBtn.click();

    const modal = page.locator('div[role="dialog"]');
    await expect(modal).toBeVisible();

    await modal.locator('[data-testid="task-title-input"]').fill('Phase 10 Super Admin Task to Maheswari');
    await modal.locator('[data-testid="task-description-input"]').fill('Assigned by Super Admin to Intern');

    // Open Assign To
    await modal.locator('[data-testid="assign-to-selector-trigger"]').click();

    // Search for Maheswari
    const searchInput = modal.locator('[data-testid="assignee-search-input"]');
    await searchInput.fill('Maheswari');
    await expect(modal.locator('[data-testid="assignee-option-maheswari"]')).toBeVisible();

    // Select Maheswari
    await modal.locator('[data-testid="assignee-option-maheswari"]').click();

    // Enroll in project if needed
    const enrollBtn = modal.locator('[data-testid="enroll-assignee-button"]');
    const submitBtn = modal.locator('[data-testid="submit-create-task-button"]');

    if (await enrollBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await expect(submitBtn).toBeDisabled();
      await enrollBtn.click();
      await expect(enrollBtn).not.toBeVisible({ timeout: 8000 });
    }

    await expect(submitBtn).toBeEnabled();
    await modal.locator('[data-testid="task-priority-select"]').selectOption('Urgent');

    // Submit Task
    await submitBtn.click();
    await expect(modal).not.toBeVisible({ timeout: 10000 });

    // Switch to "Assigned by Me" tab to view assigned task
    await page.locator('[data-testid="tasks-tab-assigned-by-me"]').click();

    // Verify task listed with assignee Maheswari
    await expect(page.locator('text=Phase 10 Super Admin Task to Maheswari')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('span:has-text("Maheswari")')).toBeVisible();

    // Persistence check on reload
    await page.reload();
    await page.locator('[data-testid="tasks-tab-assigned-by-me"]').click();
    await expect(page.locator('text=Phase 10 Super Admin Task to Maheswari')).toBeVisible({ timeout: 15000 });

    await logoutUser(page);
  });

  // ==========================================================================
  // 4. EMPLOYEE EXPERIENCE & ROLE RESTRICTIONS
  // ==========================================================================
  test('5. Employee Task Visibility & Create Task Button Block (Madhan)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await loginUser(page, USERS.employee);

    await page.goto('/app/tasks');
    await expect(page.locator('text=Task Management')).toBeVisible({ timeout: 15000 });

    // 1. Create Task button must NOT be visible for Employee
    await expect(page.locator('[data-testid="create-task-button"]')).not.toBeVisible();

    // 2. Tabs must show "My Tasks" and "Assigned by Manager"
    await expect(page.locator('[data-testid="tasks-tab-my-tasks"]')).toBeVisible();
    await expect(page.locator('[data-testid="tasks-tab-assigned-by-manager"]')).toBeVisible();
    await expect(page.locator('[data-testid="tasks-tab-all-tasks"]')).not.toBeVisible();

    // 3. The task assigned by Admin must be visible to Madhan
    await expect(page.locator('text=Phase 10 Admin Assigned Task to Madhan')).toBeVisible({ timeout: 15000 });

    // Check "Assigned by Manager" tab
    await page.locator('[data-testid="tasks-tab-assigned-by-manager"]').click();
    await expect(page.locator('text=Phase 10 Admin Assigned Task to Madhan')).toBeVisible({ timeout: 15000 });

    await logoutUser(page);
  });

  // ==========================================================================
  // 5. INTERN EXPERIENCE & ROLE RESTRICTIONS
  // ==========================================================================
  test('6. Intern Task Visibility & Create Task Button Block (Maheswari)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await loginUser(page, USERS.intern);

    await page.goto('/app/tasks');
    await expect(page.locator('text=Task Management')).toBeVisible({ timeout: 15000 });

    // 1. Create Task button must NOT be visible for Intern
    await expect(page.locator('[data-testid="create-task-button"]')).not.toBeVisible();

    // 2. Tabs must show "My Tasks" and "Assigned by Manager"
    await expect(page.locator('[data-testid="tasks-tab-my-tasks"]')).toBeVisible();
    await expect(page.locator('[data-testid="tasks-tab-assigned-by-manager"]')).toBeVisible();
    await expect(page.locator('[data-testid="tasks-tab-all-tasks"]')).not.toBeVisible();

    // 3. Task assigned by Super Admin must be visible to Maheswari
    await expect(page.locator('text=Phase 10 Super Admin Task to Maheswari')).toBeVisible({ timeout: 15000 });

    await logoutUser(page);
  });

  // ==========================================================================
  // 6. MOBILE TASK ASSIGNMENT RESPONSIVENESS
  // ==========================================================================
  const mobileModalSizes = [
    { name: 'iPad / Tablet (768x1024)', width: 768, height: 1024 },
    { name: 'iPhone 13/14 (390x844)', width: 390, height: 844 },
    { name: 'Android Small (360x800)', width: 360, height: 800 }
  ];

  for (const m of mobileModalSizes) {
    test(`7. Mobile Task Assignment Selector UX (${m.name})`, async ({ page }) => {
      await page.setViewportSize({ width: m.width, height: m.height });
      await loginUser(page, USERS.admin);

      await page.goto('/app/tasks');
      const createBtn = page.locator('[data-testid="create-task-button"]');
      await expect(createBtn).toBeVisible({ timeout: 15000 });
      await createBtn.click();

      const modal = page.locator('div[role="dialog"]');
      await expect(modal).toBeVisible();

      // Open selector
      const selector = modal.locator('[data-testid="assign-to-selector-trigger"]');
      await selector.scrollIntoViewIfNeeded();
      await selector.click();

      // Ensure search input is usable and fits without horizontal overflow
      const searchInput = modal.locator('[data-testid="assignee-search-input"]');
      await expect(searchInput).toBeVisible();
      await searchInput.fill('Elumalai');

      await expect(modal.locator('[data-testid="assignee-option-elumalai"]')).toBeVisible();

      // Cancel modal
      await modal.locator('button:has-text("Cancel")').click();
      await expect(modal).not.toBeVisible();

      await logoutUser(page);
    });
  }

  // ==========================================================================
  // 7. SECURITY: EMPLOYEE CANNOT DELEGATE OR CREATE ASSIGNED TASKS
  // ==========================================================================
  test('8. Security Trigger: Non-manager cannot create task assigned to another user', async () => {
    const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
    const empClient = createClient(supabaseUrl, anonKey);

    const { error: empLoginErr } = await empClient.auth.signInWithPassword({
      email: USERS.employee.email,
      password: USERS.employee.pass
    });
    expect(empLoginErr).toBeNull();

    // Fetch test project
    const { data: proj } = await adminSupabase
      .from('projects')
      .select('id')
      .eq('name', 'SCARO Enterprise Operations')
      .single();

    // Fetch intern ID
    const { data: internProfile } = await adminSupabase
      .from('profiles')
      .select('id')
      .eq('email', USERS.intern.email)
      .single();

    // Employee tries to create task assigned to Intern
    const { error: illegalAssignErr } = await empClient
      .from('tasks')
      .insert({
        project_id: proj?.id,
        title: `Illegal Delegation Attempt ${Date.now()}`,
        assignee_id: internProfile?.id,
        status: 'Todo'
      });

    expect(illegalAssignErr).not.toBeNull();
    expect(illegalAssignErr?.message).toContain('Unauthorized');
  });

});
