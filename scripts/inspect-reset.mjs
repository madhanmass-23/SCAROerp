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
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function inspectAll() {
  console.log('=== STEP 1: READ-ONLY INSPECTION ===\n');

  // 1. Roles
  const { data: roles } = await supabase.from('roles').select('id, name');
  console.log('Roles:', roles);

  // 2. Departments
  const { data: departments } = await supabase.from('departments').select('id, name, code');
  console.log('\nDepartments:', departments);

  // 3. Auth Users
  const { data: authUsersData, error: authErr } = await supabase.auth.admin.listUsers();
  if (authErr) {
    console.error('Error listing auth users:', authErr);
  } else {
    console.log(`\nAuth Users Total: ${authUsersData.users.length}`);
    authUsersData.users.forEach(u => {
      console.log(`  - ID: ${u.id}, Email: ${u.email}, CreatedAt: ${u.created_at}`);
    });
  }

  // 4. Profiles
  const { data: profiles } = await supabase.from('profiles').select('id, email, full_name, employment_status, is_active');
  console.log(`\nProfiles Total: ${profiles?.length || 0}`);
  profiles?.forEach(p => {
    console.log(`  - ID: ${p.id}, Email: ${p.email}, Name: ${p.full_name}, Status: ${p.employment_status}, Active: ${p.is_active}`);
  });

  // 5. User Roles
  const { data: userRoles } = await supabase.from('user_roles').select('user_id, role_id, roles(name)');
  console.log(`\nUser Roles Total: ${userRoles?.length || 0}`);
  userRoles?.forEach((ur) => {
    const roleName = ur.roles ? (Array.isArray(ur.roles) ? ur.roles[0]?.name : ur.roles.name) : 'none';
    console.log(`  - User: ${ur.user_id}, Role: ${roleName}`);
  });

  // 6. Operational Tables Row Counts
  const tables = [
    'projects',
    'project_members',
    'tasks',
    'task_comments',
    'task_attachments',
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
    'announcements',
    'audit_logs',
    'company_settings'
  ];

  console.log('\n--- Operational Tables Row Counts ---');
  for (const table of tables) {
    const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
    if (error) {
      console.log(`  ${table}: ERROR (${error.message})`);
    } else {
      console.log(`  ${table}: ${count} rows`);
    }
  }

  // 7. Storage Buckets & Objects
  console.log('\n--- Storage Buckets & Objects ---');
  const { data: buckets, error: bucketErr } = await supabase.storage.listBuckets();
  if (bucketErr) {
    console.error('Error listing buckets:', bucketErr);
  } else {
    for (const b of buckets) {
      const { data: objects } = await supabase.storage.from(b.id).list();
      console.log(`  Bucket: ${b.name} (public: ${b.public}) - Objects: ${objects?.length || 0}`);
    }
  }

  // 8. Company Settings Content
  console.log('\n--- Company Settings Content ---');
  const { data: settings } = await supabase.from('company_settings').select('*');
  console.log(settings);
}

inspectAll();
