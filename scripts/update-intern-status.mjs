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

const INTERN_EMAILS = [
  'maheswari@scaro.in',
  'nikitha@scaro.in',
  'krishnaveni@scaro.in',
  'revati@scaro.in',
  'thanmayee@scaro.in',
  'ruchitha@scaro.in',
  'rupeswari@scaro.in',
  'thoyaja@scaro.in',
  'amani@scaro.in',
  'divya@scaro.in'
];

async function updateInternStatus() {
  console.log('Updating intern employment_status to Intern...');
  // Sign in as Super Admin to satisfy `is_super_admin(auth.uid())` in restrict_profile_updates trigger!
  const anonClient = createClient(supabaseUrl, process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '');
  const { data: authResult, error: signInErr } = await anonClient.auth.signInWithPassword({
    email: 'satishkumar@scaro.in',
    password: 'Scaro@SatishKumar2026!'
  });

  if (signInErr) {
    console.error('Super Admin sign in error:', signInErr);
    return;
  }

  console.log('Signed in as Super Admin:', authResult.user.id);

  for (const email of INTERN_EMAILS) {
    const { data, error } = await anonClient
      .from('profiles')
      .update({ employment_status: 'Intern' })
      .eq('email', email)
      .select();

    if (error) {
      console.error(`Failed to update ${email}:`, error.message);
    } else {
      console.log(`Updated ${email}: status = ${data[0]?.employment_status}`);
    }
  }
}

updateInternStatus();
