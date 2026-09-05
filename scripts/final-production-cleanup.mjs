import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
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

async function runProductionCleanup() {
  console.log('==================================================');
  console.log('SCARO ERP — FINAL PRODUCTION DATABASE CLEANUP');
  console.log('==================================================\n');

  // Step 1: Clean Storage Objects from buckets (preserve buckets)
  console.log('Step 1: Cleaning storage bucket files...');
  const bucketList = ['avatars', 'daily-evidence', 'task-attachments'];
  for (const bucket of bucketList) {
    try {
      const { data: files, error: listErr } = await supabase.storage.from(bucket).list('', { limit: 100 });
      if (!listErr && files && files.length > 0) {
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
        console.log(`  Cleaned files in bucket: ${bucket}`);
      } else {
        console.log(`  Bucket ${bucket} is already empty.`);
      }
    } catch (err) {
      console.warn(`  Warning cleaning bucket ${bucket}:`, err.message);
    }
  }

  // Step 2: Clean operational database records in FK order
  console.log('\nStep 2: Cleaning operational data tables in FK order...');

  const cleanTable = async (table, filterCol = 'id') => {
    const { error } = await supabase.from(table).delete().neq(filterCol, '00000000-0000-0000-0000-000000000000');
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

  // Composite key tables
  const { error: pmErr } = await supabase.from('project_members').delete().neq('project_id', '00000000-0000-0000-0000-000000000000');
  if (pmErr) console.error('  Error cleaning project_members:', pmErr.message);
  else console.log('  Cleaned: project_members');

  await cleanTable('projects');

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

  // Step 3: Remove all test users from Supabase Auth
  console.log('\nStep 3: Removing all test users from Supabase Auth...');
  const { data: userList, error: listErr } = await supabase.auth.admin.listUsers();
  if (listErr) throw listErr;

  console.log(`Found ${userList.users.length} auth users to delete.`);
  for (const u of userList.users) {
    const { error: delErr } = await supabase.auth.admin.deleteUser(u.id);
    if (delErr) {
      console.error(`  Error deleting user ${u.email} (${u.id}):`, delErr.message);
    } else {
      console.log(`  Deleted auth user: ${u.email} (${u.id})`);
    }
  }

  // Step 4: Ensure profiles & user_roles are clean
  console.log('\nStep 4: Ensuring profiles & user_roles are clean...');
  const { error: cleanProfErr } = await supabase.from('profiles').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (cleanProfErr) console.log('  Profiles cleanup status:', cleanProfErr.message);
  else console.log('  Cleaned: profiles');

  const { error: cleanUrErr } = await supabase.from('user_roles').delete().neq('user_id', '00000000-0000-0000-0000-000000000000');
  if (cleanUrErr) console.log('  User roles cleanup status:', cleanUrErr.message);
  else console.log('  Cleaned: user_roles');

  // Step 5: Verification
  console.log('\n==================================================');
  console.log('FINAL DATABASE CLEANUP VERIFICATION');
  console.log('==================================================\n');

  const { data: remainingUsers } = await supabase.auth.admin.listUsers();
  console.log(`Auth users remaining: ${remainingUsers?.users?.length || 0}`);

  const checkCount = async (table) => {
    const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
    return error ? `ERROR: ${error.message}` : count;
  };

  const tablesToCheck = [
    'profiles',
    'user_roles',
    'tasks',
    'task_comments',
    'task_attachments',
    'projects',
    'project_members',
    'attendance_sessions',
    'meetings',
    'meeting_participants',
    'meeting_attendance',
    'daily_reports',
    'daily_report_tasks',
    'daily_report_attachments',
    'daily_report_sync',
    'leave_requests',
    'messages',
    'notifications',
    'announcements',
    'audit_logs'
  ];

  console.log('--- Operational Table Row Counts (Should be 0) ---');
  for (const t of tablesToCheck) {
    const c = await checkCount(t);
    console.log(`  ${t.padEnd(28)}: ${c}`);
  }

  console.log('\n--- Preserved Configuration Records ---');
  const companySettingsCount = await checkCount('company_settings');
  console.log(`  company_settings (Expected: 1): ${companySettingsCount}`);
  
  const rolesCount = await checkCount('roles');
  console.log(`  roles (Expected: 4):            ${rolesCount}`);

  const permissionsCount = await checkCount('permissions');
  console.log(`  permissions (Expected: 19):     ${permissionsCount}`);

  const rolePermissionsCount = await checkCount('role_permissions');
  console.log(`  role_permissions (Expected: 19): ${rolePermissionsCount}`);

  const { data: finalBuckets } = await supabase.storage.listBuckets();
  console.log(`  Storage buckets (Expected: 3):  ${finalBuckets?.map(b => b.name).join(', ')}`);
}

runProductionCleanup().catch(console.error);
