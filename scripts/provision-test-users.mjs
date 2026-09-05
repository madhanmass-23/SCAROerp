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

const TEST_USERS = [
  // 10 Interns
  { name: 'Maheswari', email: 'maheswari@scaro.in', pass: 'Scaro@Maheswari2026!', role: 'Intern', status: 'Intern' },
  { name: 'Nikitha', email: 'nikitha@scaro.in', pass: 'Scaro@Nikitha2026!', role: 'Intern', status: 'Intern' },
  { name: 'Krishna Veni', email: 'krishnaveni@scaro.in', pass: 'Scaro@KrishnaVeni2026!', role: 'Intern', status: 'Intern' },
  { name: 'Revati', email: 'revati@scaro.in', pass: 'Scaro@Revati2026!', role: 'Intern', status: 'Intern' },
  { name: 'Thanmayee', email: 'thanmayee@scaro.in', pass: 'Scaro@Thanmayee2026!', role: 'Intern', status: 'Intern' },
  { name: 'Ruchitha', email: 'ruchitha@scaro.in', pass: 'Scaro@Ruchitha2026!', role: 'Intern', status: 'Intern' },
  { name: 'Rupeswari', email: 'rupeswari@scaro.in', pass: 'Scaro@Rupeswari2026!', role: 'Intern', status: 'Intern' },
  { name: 'Thoyaja', email: 'thoyaja@scaro.in', pass: 'Scaro@Thoyaja2026!', role: 'Intern', status: 'Intern' },
  { name: 'Amani', email: 'amani@scaro.in', pass: 'Scaro@Amani2026!', role: 'Intern', status: 'Intern' },
  { name: 'Divya', email: 'divya@scaro.in', pass: 'Scaro@Divya2026!', role: 'Intern', status: 'Intern' },

  // 3 Employees
  { name: 'Madhan', email: 'madhan@scaro.in', pass: 'Scaro@Madhan2026!', role: 'Employee', status: 'Employee' },
  { name: 'Elumalai', email: 'elumalai@scaro.in', pass: 'Scaro@Elumalai2026!', role: 'Employee', status: 'Employee' },
  { name: 'Pavan Kumar', email: 'pavankumar@scaro.in', pass: 'Scaro@PavanKumar2026!', role: 'Employee', status: 'Employee' },

  // 1 Admin
  { name: 'Kumar', email: 'kumar@scaro.in', pass: 'Scaro@Kumar2026!', role: 'Admin', status: 'Employee' },

  // 1 Super Admin
  { name: 'Satish Kumar', email: 'satishkumar@scaro.in', pass: 'Scaro@SatishKumar2026!', role: 'Super Admin', status: 'Employee' }
];

export async function provisionAllTestUsers() {
  console.log('Ensuring all 15 SCARO test accounts exist and have exact roles...');

  const { data: roles, error: rolesErr } = await supabase.from('roles').select('id, name');
  if (rolesErr) throw rolesErr;

  const roleMap = {};
  roles.forEach(r => { roleMap[r.name] = r.id; });

  const { data: userList, error: listErr } = await supabase.auth.admin.listUsers();
  if (listErr) throw listErr;

  for (const userConfig of TEST_USERS) {
    let userId;
    const existing = userList.users.find(u => u.email === userConfig.email);

    if (existing) {
      userId = existing.id;
      // Update metadata & password idempotently
      await supabase.auth.admin.updateUserById(userId, {
        password: userConfig.pass,
        email_confirm: true,
        user_metadata: { full_name: userConfig.name }
      });
    } else {
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email: userConfig.email,
        password: userConfig.pass,
        email_confirm: true,
        user_metadata: { full_name: userConfig.name }
      });
      if (createErr) throw createErr;
      userId = created.user.id;
    }

    // Upsert profile
    await supabase.from('profiles').upsert({
      id: userId,
      email: userConfig.email,
      full_name: userConfig.name,
      employment_status: userConfig.status,
      is_active: true
    }, { onConflict: 'id' });

    // Assign role
    const targetRoleId = roleMap[userConfig.role];
    await supabase.from('user_roles').delete().eq('user_id', userId);
    await supabase.from('user_roles').insert({
      user_id: userId,
      role_id: targetRoleId
    });

    console.log(`  ✓ Synced: ${userConfig.name} (${userConfig.role})`);
  }

  console.log('Test user provisioning complete.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  provisionAllTestUsers().catch(err => {
    console.error('Provisioning failed:', err);
    process.exit(1);
  });
}
