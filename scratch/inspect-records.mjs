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

async function inspectRemaining() {
  const { data: reports, error: rErr } = await supabase.from('daily_reports').select('*');
  console.log('--- daily_reports ---', reports?.length, rErr || '');
  if (reports) console.log(reports);

  const { data: attendance, error: aErr } = await supabase.from('attendance_sessions').select('*');
  console.log('--- attendance_sessions ---', attendance?.length, aErr || '');
  if (attendance) console.log(attendance);

  const { data: logs, error: lErr } = await supabase.from('audit_logs').select('*');
  console.log('--- audit_logs ---', logs?.length, lErr || '');
  if (logs) console.log(logs);

  const { data: files } = await supabase.storage.from('daily-evidence').list();
  console.log('--- daily-evidence storage ---', files);
  if (files) {
    for (const f of files) {
      const { data: sub } = await supabase.storage.from('daily-evidence').list(f.name);
      console.log(`Sub (${f.name}):`, sub);
      if (sub) {
        for (const s of sub) {
          const { data: sub2 } = await supabase.storage.from('daily-evidence').list(`${f.name}/${s.name}`);
          console.log(`Sub2 (${f.name}/${s.name}):`, sub2);
        }
      }
    }
  }
}

inspectRemaining();
