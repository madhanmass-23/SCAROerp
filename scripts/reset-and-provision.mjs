import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import dns from 'dns';

dns.setDefaultResultOrder('ipv4first');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env.admin.local') });
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL?.trim();
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const OLD_DEV_EMAILS = [
  'intern@scaro.in',
  'employee@scaro.in',
  'manager@scaro.in',
  'admin@scaro.in'
];

const NEW_TEST_USERS = [
  // 10 Interns
  { name: 'Maheswari', email: 'maheswari@scaro.in', pass: 'Scaro@Maheswari2026!', role: 'Intern', status: 'Intern' },
  { name: 'Nikitha', email: 'nikitha@scaro.in', pass: 'Scaro@Nikitha2026!', role: 'Intern', status: 'Intern' },
  { name: 'Krishna Veni', email: 'krishnaveni@scaro.in', pass: 'Scaro@KrishnaVeni2026!', role: 'Intern', status: 'Intern' },
  { name: 'Revati', email: 'revati@scaro.in', pass: 'Scaro@Revati2026!', role: 'Intern', status: 'Intern' },
  { name: 'Thanmayee', email: 'thanmayee@scaro.in', pass: 'Scaro@Thanmayee2026!', role: 'Intern', status: 'Intern' },
  { name: 'Ruchitha', email: 'ruchitha@scaro.in', pass: 'Scaro@Ruchitha2026!', role: 'Intern', status: 'Intern' },
  { name: 'Rupeswari', email: 'rupeswari@scaro.in', pass: 'Scaro@Rupeswari2026!', role: 'Intern', status: 'Intern' },
  { name: 'Thoyaja', email: 'thoyaja@scaro.in', pass: 'Scaro@Thoyaja2026!', role: 'Intern', status: 'Intern' },
  { name: 'Amani', email: 'amani@scaro.in', pass: 'Scaro@Amani2026!', role: 'Intern', status: 'Intern' },
  { name: 'Divya', email: 'divya@scaro.in', pass: 'Scaro@Divya2026!', role: 'Intern', status: 'Intern' },

  // 3 Employees
  { name: 'Madhan', email: 'madhan@scaro.in', pass: 'Scaro@Madhan2026!', role: 'Employee', status: 'Employee' },
  { name: 'Elumalai', email: 'elumalai@scaro.in', pass: 'Scaro@Elumalai2026!', role: 'Employee', status: 'Employee' },
  { name: 'Pavan Kumar', email: 'pavankumar@scaro.in', pass: 'Scaro@PavanKumar2026!', role: 'Employee', status: 'Employee' },

  // 1 Admin
  { name: 'Kumar', email: 'kumar@scaro.in', pass: 'Scaro@Kumar2026!', role: 'Admin', status: 'Employee' },

  // 1 Super Admin
  { name: 'Satish Kumar', email: 'satishkumar@scaro.in', pass: 'Scaro@SatishKumar2026!', role: 'Super Admin', status: 'Employee' }
];

async function runResetAndProvision() {
  console.log('==================================================');
  console.log('SCARO ERP — REAL TESTING ENVIRONMENT RESET');
  console.log('==================================================\n');

  // Step 1: Identify existing users
  console.log('Step 1: Identifying existing users...');
  const { data: userList, error: listErr } = await supabase.auth.admin.listUsers();
  if (listErr) throw listErr;

  const usersToRemove = userList.users.filter(u => OLD_DEV_EMAILS.includes(u.email || ''));
  console.log(`Found ${usersToRemove.length} old development users to remove:`);
  usersToRemove.forEach(u => console.log(`  - ${u.email} (${u.id})`));

  // Step 2: Clean Storage Objects
  console.log('\nStep 2: Cleaning storage objects...');
  for (const bucket of ['daily-evidence', 'task-attachments']) {
    const { data: files } = await supabase.storage.from(bucket).list('', { limit: 100 });
    if (files && files.length > 0) {
      // List recursively if folder structure
      for (const item of files) {
        if (item.id) {
          await supabase.storage.from(bucket).remove([item.name]);
        } else {
          // Folder
          const { data: subFiles } = await supabase.storage.from(bucket).list(item.name);
          if (subFiles && subFiles.length > 0) {
            const subPaths = subFiles.map(sf => `${item.name}/${sf.name}`);
            await supabase.storage.from(bucket).remove(subPaths);
          }
          await supabase.storage.from(bucket).remove([item.name]);
        }
      }
      console.log(`  Cleaned bucket: ${bucket}`);
    }
  }

  // Step 3: Clean operational database records in FK order
  console.log('\nStep 3: Cleaning operational data in FK order...');

  // Helper delete function
  const cleanTable = async (table) => {
    // Delete rows where id is not null (matches all rows)
    const { error } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) console.error(`  Error cleaning ${table}:`, error.message);
    else console.log(`  Cleaned: ${table}`);
  };

  await cleanTable('daily_report_sync');
  await cleanTable('daily_report_attachments');
  await cleanTable('daily_report_tasks');
  await cleanTable('daily_reports');

  await cleanTable('task_attachments');
  await cleanTable('task_comments');
  await cleanTable('tasks');

  // project_members has composite primary key (project_id, user_id)
  const { error: pmErr } = await supabase.from('project_members').delete().neq('project_id', '00000000-0000-0000-0000-000000000000');
  if (pmErr) console.error('  Error cleaning project_members:', pmErr.message);
  else console.log('  Cleaned: project_members');

  await cleanTable('projects');

  // meeting_attendance has composite key (meeting_id, participant_id)
  await supabase.from('meeting_attendance').delete().neq('meeting_id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('meeting_participants').delete().neq('meeting_id', '00000000-0000-0000-0000-000000000000');
  console.log('  Cleaned: meeting_attendance & meeting_participants');

  await cleanTable('meetings');
  await cleanTable('leave_requests');
  await cleanTable('notifications');
  await cleanTable('messages');
  await cleanTable('announcements');
  await cleanTable('attendance_sessions');
  await cleanTable('audit_logs');

  // Step 4: Remove old dev accounts
  console.log('\nStep 4: Removing old development users from Supabase Auth...');
  for (const u of usersToRemove) {
    // Auth deletion cascades to profiles and user_roles
    const { error: delErr } = await supabase.auth.admin.deleteUser(u.id);
    if (delErr) {
      console.error(`  Failed to delete ${u.email}:`, delErr.message);
    } else {
      console.log(`  Successfully deleted ${u.email} (${u.id})`);
    }
  }

  // Step 5: Fetch Roles
  console.log('\nStep 5: Resolving system roles...');
  const { data: roles, error: rolesErr } = await supabase.from('roles').select('id, name');
  if (rolesErr) throw rolesErr;

  const roleMap = {};
  roles.forEach(r => { roleMap[r.name] = r.id; });
  console.log('  Roles resolved:', roleMap);

  // Step 6: Create new real test users
  console.log('\nStep 6: Creating 15 new real test users...');
  const createdProfiles = [];

  for (const userConfig of NEW_TEST_USERS) {
    // 1. Create or retrieve auth user
    let userId;
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email: userConfig.email,
      password: userConfig.pass,
      email_confirm: true,
      user_metadata: { full_name: userConfig.name }
    });

    if (createErr) {
      if (createErr.message.includes('already') || createErr.message.includes('registered')) {
        // User exists, find user ID
        const { data: searchList } = await supabase.auth.admin.listUsers();
        const existing = searchList.users.find(u => u.email === userConfig.email);
        userId = existing?.id;
        // Update password in case
        await supabase.auth.admin.updateUserById(userId, {
          password: userConfig.pass,
          email_confirm: true,
          user_metadata: { full_name: userConfig.name }
        });
      } else {
        console.error(`  Error creating ${userConfig.email}:`, createErr.message);
        continue;
      }
    } else {
      userId = created.user.id;
    }

    // 2. Ensure Profile
    const { error: profErr } = await supabase.from('profiles').upsert({
      id: userId,
      email: userConfig.email,
      full_name: userConfig.name,
      employment_status: userConfig.status,
      is_active: true,
      updated_at: new Date().toISOString()
    }, { onConflict: 'id' });

    if (profErr) {
      console.error(`  Profile error for ${userConfig.email}:`, profErr.message);
      continue;
    }

    // 3. Assign Role
    const targetRoleId = roleMap[userConfig.role];
    if (!targetRoleId) {
      console.error(`  Unknown role ${userConfig.role} for ${userConfig.email}`);
      continue;
    }

    // Remove any previous roles first to ensure exact role assignment
    await supabase.from('user_roles').delete().eq('user_id', userId);
    const { error: urErr } = await supabase.from('user_roles').insert({
      user_id: userId,
      role_id: targetRoleId
    });

    if (urErr) {
      console.error(`  Role assignment error for ${userConfig.email}:`, urErr.message);
      continue;
    }

    createdProfiles.push({ email: userConfig.email, name: userConfig.name, role: userConfig.role });
    console.log(`  ✓ Created & assigned: ${userConfig.name} <${userConfig.email}> → ${userConfig.role}`);
  }

  // Step 7: Verification
  console.log('\n==================================================');
  console.log('STEP 7: POST-RESET VERIFICATION');
  console.log('==================================================');

  // Verify auth users count
  const { data: finalAuth } = await supabase.auth.admin.listUsers();
  console.log(`Total Auth Users: ${finalAuth.users.length} (Expected: 15)`);

  const hasOld = finalAuth.users.some(u => OLD_DEV_EMAILS.includes(u.email || ''));
  console.log(`Old development accounts exist: ${hasOld ? 'YES (FAIL)' : 'NO (PASS)'}`);

  // Verify operational counts
  const checkTables = [
    'projects',
    'tasks',
    'daily_reports',
    'daily_report_tasks',
    'daily_report_attachments',
    'daily_report_sync',
    'attendance_sessions',
    'leave_requests',
    'meetings',
    'meeting_participants',
    'meeting_attendance',
    'notifications',
    'messages',
    'announcements'
  ];

  let allOperationalClean = true;
  for (const t of checkTables) {
    const { count } = await supabase.from(t).select('*', { count: 'exact', head: true });
    if (count > 0) {
      console.log(`  ${t}: ${count} rows (NOT ZERO!)`);
      allOperationalClean = false;
    } else {
      console.log(`  ${t}: 0 rows (CLEAN)`);
    }
  }

  // Company settings check
  const { count: csCount } = await supabase.from('company_settings').select('*', { count: 'exact', head: true });
  console.log(`  company_settings: ${csCount} row (PRESERVED)`);

  console.log(`\nOperational data clean: ${allOperationalClean ? 'PASS' : 'FAIL'}`);
  console.log('Reset and provisioning complete.');
}

runResetAndProvision().catch(err => {
  console.error('Fatal error during reset:', err);
  process.exit(1);
});
