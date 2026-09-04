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

const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanAuditAndVerify() {
  await supabase.from('audit_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000');

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

  console.log('=== VERIFYING OPERATIONAL TABLES ===');
  let clean = true;
  for (const t of checkTables) {
    const { count, error } = await supabase.from(t).select('*', { count: 'exact', head: true });
    if (error) console.log(`  ${t}: ERROR (${error.message})`);
    else {
      console.log(`  ${t}: ${count} rows`);
      if (count > 0) clean = false;
    }
  }

  const { count: csCount } = await supabase.from('company_settings').select('*', { count: 'exact', head: true });
  console.log(`  company_settings: ${csCount} row (PRESERVED)`);
  console.log(`\nOperational Cleanliness: ${clean ? 'PASS (100% Clean)' : 'FAIL'}`);
}

cleanAuditAndVerify();
