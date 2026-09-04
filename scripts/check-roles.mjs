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

async function checkUserRoles() {
  const { data: userRoles } = await supabase.from('user_roles').select('user_id, role_id, roles(name)');
  const { data: profiles } = await supabase.from('profiles').select('id, email, full_name');
  
  console.log('Total user_roles:', userRoles.length);
  const byUser = {};
  userRoles.forEach(ur => {
    byUser[ur.user_id] = byUser[ur.user_id] || [];
    byUser[ur.user_id].push(ur.roles ? (Array.isArray(ur.roles) ? ur.roles[0]?.name : ur.roles.name) : ur.role_id);
  });

  for (const [userId, rolesList] of Object.entries(byUser)) {
    const prof = profiles.find(p => p.id === userId);
    console.log(`${prof?.email || userId}: [${rolesList.join(', ')}]`);
  }
}

checkUserRoles();
