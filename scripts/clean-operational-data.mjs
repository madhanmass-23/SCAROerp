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

// Recursive storage bucket cleanup helper
async function cleanBucketRecursive(bucketName) {
  console.log(`Cleaning storage bucket: ${bucketName}...`);
  
  async function listAllFiles(folder = '') {
    const { data, error } = await supabase.storage.from(bucketName).list(folder, { limit: 100 });
    if (error) {
      console.error(`  Error listing ${bucketName}/${folder}:`, error.message);
      return [];
    }
    let files = [];
    for (const item of data || []) {
      const fullPath = folder ? `${folder}/${item.name}` : item.name;
      if (item.id) {
        // It's a file
        files.push(fullPath);
      } else {
        // It's a directory
        const subFiles = await listAllFiles(fullPath);
        files = files.concat(subFiles);
      }
    }
    return files;
  }

  const filesToDelete = await listAllFiles();
  if (filesToDelete.length > 0) {
    console.log(`  Deleting ${filesToDelete.length} files from ${bucketName}...`);
    // Delete in batches of 50
    for (let i = 0; i < filesToDelete.length; i += 50) {
      const batch = filesToDelete.slice(i, i + 50);
      const { error: delErr } = await supabase.storage.from(bucketName).remove(batch);
      if (delErr) {
        console.error(`  Error deleting files from ${bucketName}:`, delErr.message);
      }
    }
    console.log(`  ✓ Successfully cleared bucket ${bucketName}`);
  } else {
    console.log(`  Bucket ${bucketName} is already empty.`);
  }
}

async function cleanOperationalData() {
  console.log('==================================================');
  console.log('PURGING OPERATIONAL DATA IN FK DEPENDENCY ORDER');
  console.log('==================================================\n');

  // Clean Storage Buckets
  await cleanBucketRecursive('daily-evidence');
  await cleanBucketRecursive('task-attachments');
  await cleanBucketRecursive('avatars');

  // Clean tables in strict foreign-key order
  const cleanTable = async (table, col = 'id') => {
    const { error } = await supabase.from(table).delete().neq(col, '00000000-0000-0000-0000-000000000000');
    if (error) {
      console.error(`  Error deleting from ${table}:`, error.message);
    } else {
      console.log(`  ✓ Cleaned ${table}`);
    }
  };

  console.log('\nPurging database tables...');
  await cleanTable('daily_report_sync', 'report_id');
  await cleanTable('daily_report_attachments');
  await cleanTable('daily_report_tasks');
  await cleanTable('daily_reports');

  await cleanTable('task_attachments');
  await cleanTable('task_comments');
  await cleanTable('tasks');

  await cleanTable('project_members', 'project_id');
  await cleanTable('projects');

  await cleanTable('meeting_attendance', 'meeting_id');
  await cleanTable('meeting_participants', 'meeting_id');
  await cleanTable('meetings');

  await cleanTable('leave_requests');
  await cleanTable('announcements');
  await cleanTable('notifications');
  await cleanTable('messages');
  await cleanTable('attendance_sessions');
  await cleanTable('audit_logs');

  console.log('\n==================================================');
  console.log('VERIFYING ZERO OPERATIONAL ROWS');
  console.log('==================================================\n');

  const checkTables = [
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
    'audit_logs'
  ];

  let allClean = true;
  for (const table of checkTables) {
    const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
    if (error) {
      console.error(`  ${table}: ERROR (${error.message})`);
      allClean = false;
    } else {
      console.log(`  ${table}: ${count} rows`);
      if (count !== 0) allClean = false;
    }
  }

  // Verify company settings singleton is preserved
  const { data: settings, error: csErr } = await supabase.from('company_settings').select('*');
  if (csErr) {
    console.error('  company_settings ERROR:', csErr.message);
    allClean = false;
  } else {
    console.log(`  company_settings: ${settings?.length} row (PRESERVED: ${settings?.[0]?.company_name})`);
  }

  console.log(`\nOperational Cleanliness: ${allClean ? 'PASS (100% CLEAN)' : 'FAIL'}`);
}

cleanOperationalData().catch(err => {
  console.error('Fatal error during cleaning:', err);
  process.exit(1);
});
