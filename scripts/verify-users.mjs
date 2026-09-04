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

async function verify() {
  console.log('=== VERIFYING USERS, PROFILES & ROLES ===\n');

  const { data: authData } = await supabase.auth.admin.listUsers();
  const { data: profiles } = await supabase.from('profiles').select('id, email, full_name, is_active, employment_status');
  const { data: userRoles } = await supabase.from('user_roles').select('user_id, role_id, roles(name)');

  console.log(`Auth Users: ${authData.users.length}`);
  console.log(`Profiles: ${profiles.length}`);
  console.log(`User Roles: ${userRoles.length}\n`);

  let allMatch = true;

  for (const u of authData.users) {
    const prof = profiles.find(p => p.id === u.id);
    const ur = userRoles.find(r => r.user_id === u.id);
    const roleName = ur?.roles ? (Array.isArray(ur.roles) ? ur.roles[0]?.name : ur.roles.name) : 'none';

    if (!prof) {
      console.error(`MISSING PROFILE for ${u.email}`);
      allMatch = false;
      continue;
    }
    if (prof.email !== u.email) {
      console.error(`EMAIL MISMATCH: auth=${u.email}, prof=${prof.email}`);
      allMatch = false;
    }
    if (!prof.is_active) {
      console.error(`USER INACTIVE: ${u.email}`);
      allMatch = false;
    }

    console.log(`✓ ${prof.full_name.padEnd(16)} | ${u.email.padEnd(24)} | Role: ${roleName.padEnd(12)} | Status: ${prof.employment_status}`);
  }

  // Check for duplicate profiles or roles
  const emails = profiles.map(p => p.email);
  const emailSet = new Set(emails);
  if (emails.length !== emailSet.size) {
    console.error('DUPLICATE PROFILES DETECTED');
    allMatch = false;
  }

  const roleUserIds = userRoles.map(r => r.user_id);
  const roleUserSet = new Set(roleUserIds);
  if (roleUserIds.length !== roleUserSet.size) {
    console.error('DUPLICATE ROLE ASSIGNMENTS DETECTED');
    allMatch = false;
  }

  console.log(`\nIntegrity Check: ${allMatch ? 'PASS (100% Consistent)' : 'FAIL'}`);
}

verify();
