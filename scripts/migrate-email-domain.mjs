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

async function migrateDomain() {
  console.log('Starting migration from @scaro.com to @scaro.in...');
  
  // 1. Fetch all Auth users
  const { data: userList, error: listErr } = await supabase.auth.admin.listUsers();
  if (listErr) {
    console.error('Failed to list auth users:', listErr);
    process.exit(1);
  }

  console.log(`Found ${userList.users.length} auth users.`);

  for (const user of userList.users) {
    if (user.email && user.email.endsWith('@scaro.com')) {
      const newEmail = user.email.replace('@scaro.com', '@scaro.in');
      console.log(`Migrating auth user ${user.id}: ${user.email} -> ${newEmail}`);
      
      const { error: updateAuthErr } = await supabase.auth.admin.updateUserById(user.id, {
        email: newEmail,
        email_confirm: true
      });

      if (updateAuthErr) {
        console.error(`Error updating auth user ${user.id}:`, updateAuthErr.message);
      } else {
        console.log(`Successfully updated auth email for ${user.id}`);
      }

      // Update profiles table
      const { error: updateProfileErr } = await supabase
        .from('profiles')
        .update({ email: newEmail })
        .eq('id', user.id);

      if (updateProfileErr) {
        console.error(`Error updating profile ${user.id}:`, updateProfileErr.message);
      } else {
        console.log(`Successfully updated profile email for ${user.id}`);
      }
    }
  }

  console.log('\n--- Verification ---');
  const { data: afterUsers } = await supabase.auth.admin.listUsers();
  console.log('Auth users after migration:');
  afterUsers?.users?.forEach(u => console.log(`  ${u.id}: ${u.email}`));

  const { data: afterProfiles } = await supabase.from('profiles').select('id, email, full_name, employment_status');
  console.log('\nProfiles after migration:');
  afterProfiles?.forEach(p => console.log(`  ${p.id}: ${p.email} (${p.full_name}, ${p.employment_status})`));

  const { data: userRoles } = await supabase.from('user_roles').select('user_id, roles(name)');
  console.log('\nUser Roles after migration:');
  userRoles?.forEach(ur => console.log(`  ${ur.user_id}: ${ur.roles?.name}`));
}

migrateDomain().catch(console.error);
