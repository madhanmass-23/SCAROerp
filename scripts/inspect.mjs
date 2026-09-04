import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load envs
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../.env.admin.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL?.trim();
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing env vars');
  process.exit(1);
}

console.log('URL length:', supabaseUrl.length);
console.log('Key length:', supabaseKey.length);

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspect() {
  console.log('--- ROLES ---');
  const { data: roles, error: rolesErr } = await supabase.from('roles').select('*');
  console.log(rolesErr || roles);

  console.log('--- PROFILES (limit 1) ---');
  const { data: profiles, error: profErr } = await supabase.from('profiles').select('*').limit(1);
  console.log(profErr || profiles);
  
  console.log('--- USER_ROLES (limit 1) ---');
  const { data: userRoles, error: urErr } = await supabase.from('user_roles').select('*').limit(1);
  console.log(urErr || userRoles);
}

inspect();
