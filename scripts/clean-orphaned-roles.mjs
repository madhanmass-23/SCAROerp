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

async function cleanupOrphanedRoles() {
  const { data: authData } = await supabase.auth.admin.listUsers();
  const validUserIds = authData.users.map(u => u.id);

  const { data: userRoles } = await supabase.from('user_roles').select('user_id');
  const orphaned = userRoles.filter(ur => !validUserIds.includes(ur.user_id));

  console.log(`Found ${orphaned.length} orphaned user_roles records.`);
  for (const o of orphaned) {
    await supabase.from('user_roles').delete().eq('user_id', o.user_id);
    console.log(`  Deleted orphaned role for user_id: ${o.user_id}`);
  }

  // Check total user_roles now
  const { count } = await supabase.from('user_roles').select('*', { count: 'exact', head: true });
  console.log(`Total user_roles after cleanup: ${count} (Expected: 15)`);
}

cleanupOrphanedRoles();
