import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.admin.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';

const adminSupabase = createClient(supabaseUrl, serviceRoleKey);

test.describe('Phase 8 — Projects & Task Management Intelligence', () => {
  test.setTimeout(90000);

  let employeeUser: { id: string; email: string };
  let adminUser: { id: string; email: string };
  let internUser: { id: string; email: string };

  let employeeClient: any;
  let adminClient: any;
  let testProject: any;
  let privateProject: any;

  test.beforeAll(async () => {
    // 1. Fetch test profiles
    const { data: empProfile } = await adminSupabase
      .from('profiles')
      .select('id, email')
      .eq('email', 'employee@scaro.com')
      .single();

    const { data: admProfile } = await adminSupabase
      .from('profiles')
      .select('id, email')
      .eq('email', 'admin@scaro.com')
      .single();

    const { data: intProfile } = await adminSupabase
      .from('profiles')
      .select('id, email')
      .eq('email', 'intern@scaro.com')
      .single();

    employeeUser = empProfile!;
    adminUser = admProfile!;
    internUser = intProfile!;

    // 2. Initialize authenticated Supabase clients
    employeeClient = createClient(supabaseUrl, anonKey);
    await employeeClient.auth.signInWithPassword({
      email: 'employee@scaro.com',
      password: 'Scaro@Employee2026!',
    });

    adminClient = createClient(supabaseUrl, anonKey);
    await adminClient.auth.signInWithPassword({
      email: 'admin@scaro.com',
      password: 'Scaro@Admin2026!',
    });

    // 3. Setup test projects
    // Project A: employee is a member
    const { data: projA } = await adminSupabase
      .from('projects')
      .insert({
        name: `Phase 8 Test Shared Project ${Date.now()}`,
        description: 'Project with employee membership',
        status: 'Active',
        created_by: adminUser.id,
        owner_id: adminUser.id,
      })
      .select()
      
      .single();

    testProject = projA!;

    await adminSupabase.from('project_members').insert([
      { project_id: testProject.id, user_id: adminUser.id },
      { project_id: testProject.id, user_id: employeeUser.id },
    ]);

    // Project B: private project (employee is NOT a member)
    const { data: projB } = await adminSupabase
      .from('projects')
      .insert({
        name: `Phase 8 Secret Admin Project ${Date.now()}`,
        description: 'Project without employee membership',
        status: 'Active',
        created_by: adminUser.id,
        owner_id: adminUser.id,
      })
      .select()
      .single();

    privateProject = projB!;

    await adminSupabase.from('project_members').insert([
      { project_id: privateProject.id, user_id: adminUser.id },
    ]);

    // Ensure employee has a daily report so check-in interceptor is bypassed
    const today = new Date().toISOString().split('T')[0];
    await adminSupabase.from('daily_reports').upsert({
      user_id: employeeUser.id,
      report_date: today,
      status: 'draft',
      notes: 'Test session plan',
    }, { onConflict: 'user_id,report_date' });
  });

  test.afterAll(async () => {
    // Clean up test projects and cascaded tasks
    if (testProject?.id) {
      await adminSupabase.from('projects').delete().eq('id', testProject.id);
    }
    if (privateProject?.id) {
      await adminSupabase.from('projects').delete().eq('id', privateProject.id);
    }
    await adminSupabase.from('tasks').delete().like('title', 'Phase 8%');
  });

  // ==========================================================================
  // CRITICAL SECURITY FIX #1: COLUMN TAMPERING PROTECTION
  // ==========================================================================

  test('Case 1: Employee CANNOT modify assignee_id (reassignment tampering blocked)', async () => {
    // 1. Admin creates task assigned to employee
    const { data: task, error: createErr } = await adminSupabase
      .from('tasks')
      .insert({
        project_id: testProject.id,
        title: `Phase 8 Task Tamper Reassign Test ${Date.now()}`,
        assignee_id: employeeUser.id,
        reporter_id: adminUser.id,
        status: 'Todo',
        priority: 'Medium',
      })
      .select()
      .single();

    expect(createErr).toBeNull();
    expect(task).toBeDefined();

    // 2. Employee attempts to reassign task to internUser
    const { error: tamperErr } = await employeeClient
      .from('tasks')
      .update({ assignee_id: internUser.id })
      .eq('id', task.id);

    // Database BEFORE UPDATE trigger MUST block reassignment
    expect(tamperErr).not.toBeNull();
    expect(tamperErr?.message).toContain('Unauthorized: task re-assignment is not permitted');

    // 3. Verify assignee remains employee
    const { data: check } = await adminSupabase
      .from('tasks')
      .select('assignee_id')
      .eq('id', task.id)
      .single();

    expect(check?.assignee_id).toBe(employeeUser.id);

    await adminSupabase.from('tasks').delete().eq('id', task.id);
  });

  test('Case 2: Employee CANNOT modify reporter_id (creator spoofing blocked)', async () => {
    const { data: task, error: createErr } = await adminSupabase
      .from('tasks')
      .insert({
        project_id: testProject.id,
        title: `Phase 8 Task Tamper Reporter Test ${Date.now()}`,
        assignee_id: employeeUser.id,
        reporter_id: adminUser.id,
        status: 'Todo',
        priority: 'Medium',
      })
      .select()
      .single();

    expect(createErr).toBeNull();

    // Employee attempts to change reporter to self
    const { error: tamperErr } = await employeeClient
      .from('tasks')
      .update({ reporter_id: employeeUser.id })
      .eq('id', task.id);

    expect(tamperErr).not.toBeNull();
    expect(tamperErr?.message).toContain('Unauthorized: reporter_id is immutable');

    await adminSupabase.from('tasks').delete().eq('id', task.id);
  });

  test('Case 3: Employee CANNOT modify project_id (cross-project task moving blocked)', async () => {
    const { data: task, error: createErr } = await adminSupabase
      .from('tasks')
      .insert({
        project_id: testProject.id,
        title: `Phase 8 Task Tamper Project Move Test ${Date.now()}`,
        assignee_id: employeeUser.id,
        reporter_id: adminUser.id,
        status: 'Todo',
        priority: 'Medium',
      })
      .select()
      .single();

    expect(createErr).toBeNull();

    // Employee attempts to move task to privateProject
    const { error: tamperErr } = await employeeClient
      .from('tasks')
      .update({ project_id: privateProject.id })
      .eq('id', task.id);

    expect(tamperErr).not.toBeNull();
    expect(tamperErr?.message).toContain('Unauthorized: project_id is immutable');

    await adminSupabase.from('tasks').delete().eq('id', task.id);
  });

  // ==========================================================================
  // CRITICAL SECURITY FIX #2: STATUS WORKFLOW & ENUM VALIDATION
  // ==========================================================================

  test('Case 4: Invalid task status string (e.g. pending, in_progress) MUST FAIL', async () => {
    const { data: task, error: createErr } = await adminSupabase
      .from('tasks')
      .insert({
        project_id: testProject.id,
        title: `Phase 8 Task Invalid Status Test ${Date.now()}`,
        assignee_id: employeeUser.id,
        reporter_id: adminUser.id,
        status: 'Todo',
      })
      .select()
      .single();

    expect(createErr).toBeNull();

    // Attempting to set status to 'pending' (lowercase/unsupported)
    const { error: badStatusErr1 } = await employeeClient
      .from('tasks')
      .update({ status: 'pending' })
      .eq('id', task.id);

    expect(badStatusErr1).not.toBeNull();

    // Attempting to set status to 'in_progress' (lowercase underscore)
    const { error: badStatusErr2 } = await employeeClient
      .from('tasks')
      .update({ status: 'in_progress' })
      .eq('id', task.id);

    expect(badStatusErr2).not.toBeNull();

    await adminSupabase.from('tasks').delete().eq('id', task.id);
  });

  test('Case 5: Valid task status workflow & progress auto-completion', async () => {
    const { data: task, error: createErr } = await adminSupabase
      .from('tasks')
      .insert({
        project_id: testProject.id,
        title: `Phase 8 Task Workflow Test ${Date.now()}`,
        assignee_id: employeeUser.id,
        reporter_id: adminUser.id,
        status: 'Todo',
        progress: 10,
      })
      .select()
      .single();

    expect(createErr).toBeNull();

    // 1. Todo -> In Progress
    const { error: err1 } = await employeeClient
      .from('tasks')
      .update({ status: 'In Progress', progress: 40 })
      .eq('id', task.id);
    expect(err1).toBeNull();

    // 2. In Progress -> Review
    const { error: err2 } = await employeeClient
      .from('tasks')
      .update({ status: 'Review', progress: 90 })
      .eq('id', task.id);
    expect(err2).toBeNull();

    // 3. Review -> Completed (Auto-syncs progress to 100%)
    const { error: err3 } = await adminClient
      .from('tasks')
      .update({ status: 'Completed' })
      .eq('id', task.id);
    expect(err3).toBeNull();

    const { data: finalTask } = await adminSupabase
      .from('tasks')
      .select('status, progress')
      .eq('id', task.id)
      .single();

    expect(finalTask?.status).toBe('Completed');
    expect(finalTask?.progress).toBe(100);

    await adminSupabase.from('tasks').delete().eq('id', task.id);
  });

  // ==========================================================================
  // TASK CREATION & MEMBERSHIP GATING
  // ==========================================================================

  test('Case 6: Employee CANNOT assign task to another user upon creation', async () => {
    // Non-manager employee attempts to create task assigned to internUser
    const { error: createErr } = await employeeClient
      .from('tasks')
      .insert({
        project_id: testProject.id,
        title: `Phase 8 Employee Illegal Delegation ${Date.now()}`,
        assignee_id: internUser.id,
        reporter_id: employeeUser.id,
        status: 'Todo',
      });

    expect(createErr).not.toBeNull();
    expect(createErr?.message).toContain('Unauthorized');
  });

  test('Case 7: Employee CANNOT create task in project where they are not enrolled', async () => {
    // Non-manager employee attempts to create task in privateProject
    const { error: createErr } = await employeeClient
      .from('tasks')
      .insert({
        project_id: privateProject.id,
        title: `Phase 8 Intruder Task ${Date.now()}`,
        assignee_id: employeeUser.id,
        reporter_id: employeeUser.id,
        status: 'Todo',
      });

    expect(createErr).not.toBeNull();
  });

  test('Case 8: Non-member CANNOT access or query tasks of private project', async () => {
    // Admin creates task in privateProject
    const { data: privateTask, error: createErr } = await adminSupabase
      .from('tasks')
      .insert({
        project_id: privateProject.id,
        title: `Phase 8 Secret Admin Task ${Date.now()}`,
        assignee_id: adminUser.id,
        reporter_id: adminUser.id,
        status: 'Todo',
      })
      .select()
      .single();

    expect(createErr).toBeNull();

    // Employee queries private project tasks
    const { data: empView } = await employeeClient
      .from('tasks')
      .select('id, title')
      .eq('id', privateTask.id);

    // RLS must return empty array
    expect(empView?.length || 0).toBe(0);

    await adminSupabase.from('tasks').delete().eq('id', privateTask.id);
  });

  // ==========================================================================
  // STORAGE & ATTACHMENTS
  // ==========================================================================

  test('Case 9: Private task-attachments bucket exists and enforces RLS', async () => {
    // Verify task-attachments bucket exists and is private
    const { data: bucket, error: bucketErr } = await adminSupabase
      .storage
      .getBucket('task-attachments');

    expect(bucketErr).toBeNull();
    expect(bucket).toBeDefined();
    expect(bucket?.public).toBe(false);

    // Create task in testProject
    const { data: task, error: createErr } = await adminSupabase
      .from('tasks')
      .insert({
        project_id: testProject.id,
        title: `Phase 8 Attachment Test Task ${Date.now()}`,
        assignee_id: employeeUser.id,
        reporter_id: adminUser.id,
        status: 'Todo',
      })
      .select()
      .single();

    expect(createErr).toBeNull();

    // 1. Enrolled employee uploads attachment to task
    const testFilePath = `${task.id}/test_spec_${Date.now()}.txt`;
    const { error: uploadErr } = await employeeClient
      .storage
      .from('task-attachments')
      .upload(testFilePath, Buffer.from('Confidential task specifications'), {
        contentType: 'text/plain',
      });

    expect(uploadErr).toBeNull();

    // 2. Generate signed URL
    const { data: signedUrlData, error: signErr } = await employeeClient
      .storage
      .from('task-attachments')
      .createSignedUrl(testFilePath, 300);

    expect(signErr).toBeNull();
    expect(signedUrlData?.signedUrl).toContain('token=');

    // Clean up
    await adminSupabase.storage.from('task-attachments').remove([testFilePath]);
    await adminSupabase.from('tasks').delete().eq('id', task.id);
  });

  // ==========================================================================
  // AUDIT LOGGING
  // ==========================================================================

  test('Case 10: Audit logs capture project operations', async () => {
    // 1. Create a project
    const { data: proj, error: createErr } = await adminSupabase
      .from('projects')
      .insert({
        name: `Phase 8 Audit Test Project ${Date.now()}`,
        status: 'Active',
        created_by: adminUser.id,
      })
      .select()
      .single();

    expect(createErr).toBeNull();

    // 2. Query audit_logs for projects table
    const { data: projLogs } = await adminSupabase
      .from('audit_logs')
      .select('*')
      .eq('table_name', 'projects')
      .eq('record_id', proj.id);

    expect(projLogs && projLogs.length > 0).toBe(true);
    expect(projLogs![0].action).toBe('INSERT');

    // Clean up
    await adminSupabase.from('projects').delete().eq('id', proj.id);
  });

  // ==========================================================================
  // PLAYWRIGHT UI WORKFLOWS
  // ==========================================================================

  test('Case 11: Playwright UI End-to-End: Admin Projects & Task Creation Flow', async ({ page }) => {
    // 1. Login as Admin
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin@scaro.com');
    await page.fill('input[type="password"]', 'Scaro@Admin2026!');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/app/**', { timeout: 15000 });

    // 2. Navigate to Projects
    await page.click('aside >> text=Projects');
    await page.waitForURL('**/app/projects', { timeout: 15000 });
    await expect(page.locator('text=Projects').first()).toBeVisible({ timeout: 15000 });

    // 3. Click New Project Button
    const newProjectBtn = page.locator('button:has-text("New Project")');
    await expect(newProjectBtn).toBeVisible({ timeout: 15000 });
    await newProjectBtn.click();

    // 4. Fill Create Project Form
    const uniqueProjectName = `Phase 8 E2E Project ${Date.now()}`;
    await page.fill('input[placeholder*="Website Redesign"]', uniqueProjectName);
    await page.fill('textarea[placeholder*="objectives"]', 'Created via Playwright test');
    await page.click('button:has-text("Create Project")');

    // 5. Verify project appears on grid
    await expect(page.locator(`text=${uniqueProjectName}`)).toBeVisible({ timeout: 15000 });

    // 6. Click project to open Project Details & Activity Overview
    await page.locator('.hover\\:shadow-md').filter({ hasText: uniqueProjectName }).first().click();
    await expect(page.locator('text=Project Details & Activity Overview')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=Recent Daily Report Logs')).toBeVisible({ timeout: 15000 });
    await page.keyboard.press('Escape');

    // 7. Navigate to Tasks
    await page.click('aside >> text=All Tasks');
    await page.waitForURL('**/app/tasks', { timeout: 15000 });
    await expect(page.locator('h1:has-text("Task Management")')).toBeVisible({ timeout: 15000 });

    page.on('dialog', (dialog) => {
      console.log('Case 11 Dialog:', dialog.message());
      dialog.dismiss();
    });

    // 8. Click Create Task
    await page.click('button:has-text("Create Task")');
    await expect(page.locator('text=Create New Task')).toBeVisible({ timeout: 15000 });

    const uniqueTaskTitle = `Phase 8 E2E Task ${Date.now()}`;
    await page.fill('input[placeholder*="Implement API"]', uniqueTaskTitle);
    await page.fill('textarea[placeholder*="Provide technical"]', 'Detailed test task description');

    const projectSelect = page.locator('#create-task-project-select');
    if (await projectSelect.isVisible()) {
      await projectSelect.selectOption({ label: uniqueProjectName });
    }

    await page.locator('.fixed.inset-0 button[type="submit"]').click();

    // Wait for Create Task modal to close
    await expect(page.locator('text=Create New Task')).not.toBeVisible({ timeout: 15000 });

    // 9. Verify task appears on task list
    await expect(page.locator(`text=${uniqueTaskTitle}`)).toBeVisible({ timeout: 15000 });

    // Clean up created records
    await adminSupabase.from('tasks').delete().eq('title', uniqueTaskTitle);
    await adminSupabase.from('projects').delete().eq('name', uniqueProjectName);
  });

  test('Case 12: Playwright UI End-to-End: Employee My Tasks, Progress & Comments', async ({ page }) => {
    // 1. Setup assigned task for employee
    const uniqueEmployeeTask = `Employee Work Task ${Date.now()}`;
    const { data: task } = await adminSupabase
      .from('tasks')
      .insert({
        project_id: testProject.id,
        title: uniqueEmployeeTask,
        description: 'Assigned to employee for progress testing',
        assignee_id: employeeUser.id,
        reporter_id: adminUser.id,
        status: 'Todo',
        priority: 'High',
        progress: 20,
      })
      .select()
      .single();

    // 2. Login as Employee
    await page.goto('/login');
    await page.fill('input[type="email"]', 'employee@scaro.com');
    await page.fill('input[type="password"]', 'Scaro@Employee2026!');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/app/**', { timeout: 15000 });

    // Handle check-in modal if shown
    const checkInBtn = page.locator('button:has-text("Check In & Start Working")');
    if (await checkInBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await page.fill('textarea', 'Working on assigned tasks');
      await checkInBtn.click();
      await expect(checkInBtn).not.toBeVisible({ timeout: 10000 });
    }

    // 3. Navigate to Tasks
    await page.goto('/app/tasks');
    await expect(page.locator('h1:has-text("Task Management")')).toBeVisible({ timeout: 15000 });

    // 4. Verify task appears in My Tasks
    await expect(page.locator(`text=${uniqueEmployeeTask}`)).toBeVisible({ timeout: 10000 });

    // 5. Open Task Details Modal
    await page.click(`text=${uniqueEmployeeTask}`);
    await expect(page.locator('text=Task Details')).toBeVisible();
    await expect(page.getByRole('heading', { name: /Discussion/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Attachments/ })).toBeVisible();

    // 6. Post a Comment
    const commentText = `Playwright comment ${Date.now()}`;
    await page.fill('input[placeholder*="Write a comment"]', commentText);
    await page.click('button:has(svg.lucide-send)');
    await expect(page.locator(`text=${commentText}`)).toBeVisible({ timeout: 5000 });

    // 7. Update status via select
    const statusSelect = page.locator('.fixed.inset-0 select').first();
    await statusSelect.selectOption('In Progress');
    await expect(statusSelect).toHaveValue('In Progress', { timeout: 5000 });

    await page.keyboard.press('Escape');

    // Clean up
    await adminSupabase.from('tasks').delete().eq('id', task.id);
  });
});
