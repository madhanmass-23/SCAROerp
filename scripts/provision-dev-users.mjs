import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Explicitly load the admin environment first, then the local one
const adminEnvPath = path.resolve(__dirname, '../.env.admin.local');
const localEnvPath = path.resolve(__dirname, '../.env.local');

if (fs.existsSync(adminEnvPath)) {
  dotenv.config({ path: adminEnvPath });
}
if (fs.existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath });
}

const supabaseUrl = process.env.VITE_SUPABASE_URL?.trim();
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment files.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const USERS = [
  { email: 'admin@scaro.com', password: 'Scaro@Admin2026!', full_name: 'Super Admin', role_name: 'Super Admin' },
  { email: 'manager@scaro.com', password: 'Scaro@Manager2026!', full_name: 'SCARO Administrator', role_name: 'Admin' },
  { email: 'employee@scaro.com', password: 'Scaro@Employee2026!', full_name: 'SCARO Employee', role_name: 'Employee' },
  { email: 'intern@scaro.com', password: 'Scaro@Intern2026!', full_name: 'SCARO Intern', role_name: 'Intern' }
];

async function provisionUsers() {
  console.log('Fetching existing roles...');
  const { data: existingRoles, error: rolesErr } = await supabase.from('roles').select('id, name');
  
  if (rolesErr) {
    console.error('Failed to fetch roles:', rolesErr.message);
    process.exit(1);
  }

  for (const userConfig of USERS) {
    console.log(`\nProcessing user: ${userConfig.email}`);
    
    // 1. Create or fetch Auth User
    let userId;
    const { data: newUserData, error: createUserErr } = await supabase.auth.admin.createUser({
      email: userConfig.email,
      password: userConfig.password,
      email_confirm: true
    });

    if (createUserErr) {
      if (createUserErr.message.includes('already exists') || createUserErr.message.includes('already been registered')) {
        console.log(`Auth user ${userConfig.email} already exists. Fetching...`);
        // We have to list users to find the ID since admin API doesn't have a direct getByEmail
        const { data: listData, error: listErr } = await supabase.auth.admin.listUsers();
        if (listErr) {
          console.error(`Failed to list users to find ${userConfig.email}:`, listErr.message);
          continue;
        }
        const existingUser = listData.users.find(u => u.email === userConfig.email);
        if (!existingUser) {
          console.error(`Could not find existing user ${userConfig.email} in the user list.`);
          continue;
        }
        userId = existingUser.id;
      } else {
        console.error(`Failed to create auth user ${userConfig.email}:`, createUserErr.message);
        continue;
      }
    } else {
      console.log(`Created new auth user for ${userConfig.email}`);
      userId = newUserData.user.id;
    }

    // 2. Upsert Profile
    console.log(`Ensuring profile exists for ${userId}...`);
    const { error: profileErr } = await supabase.from('profiles').upsert({
      id: userId,
      email: userConfig.email,
      full_name: userConfig.full_name,
      is_active: true
    }, { onConflict: 'id' });

    if (profileErr) {
      console.error(`Failed to upsert profile for ${userConfig.email}:`, profileErr.message);
      continue;
    }

    // 3. Assign Role
    const roleConfig = existingRoles.find(r => r.name === userConfig.role_name);
    if (!roleConfig) {
      console.error(`Role '${userConfig.role_name}' not found in database! Available roles:`, existingRoles.map(r => r.name).join(', '));
      continue;
    }

    console.log(`Assigning role '${userConfig.role_name}' to ${userConfig.email}...`);
    const { error: userRoleErr } = await supabase.from('user_roles').upsert({
      user_id: userId,
      role_id: roleConfig.id
    }, { onConflict: 'user_id,role_id' }); // Assuming composite key. Adjust if just user_id

    if (userRoleErr) {
      console.error(`Failed to assign role for ${userConfig.email}:`, userRoleErr.message);
      continue;
    }

    console.log(`Successfully provisioned ${userConfig.email}`);
  }
}

provisionUsers().then(() => {
  console.log('\nProvisioning complete.');
});
