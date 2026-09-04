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

const EXPECTED_USERS = [
  // 10 Interns
  { name: 'Maheswari', email: 'maheswari@scaro.com', role: 'Intern', status: 'Intern' },
  { name: 'Nikitha', email: 'nikitha@scaro.com', role: 'Intern', status: 'Intern' },
  { name: 'Krishna Veni', email: 'krishnaveni@scaro.com', role: 'Intern', status: 'Intern' },
  { name: 'Revati', email: 'revati@scaro.com', role: 'Intern', status: 'Intern' },
  { name: 'Thanmayee', email: 'thanmayee@scaro.com', role: 'Intern', status: 'Intern' },
  { name: 'Ruchitha', email: 'ruchitha@scaro.com', role: 'Intern', status: 'Intern' },
  { name: 'Rupeswari', email: 'rupeswari@scaro.com', role: 'Intern', status: 'Intern' },
  { name: 'Thoyaja', email: 'thoyaja@scaro.com', role: 'Intern', status: 'Intern' },
  { name: 'Amani', email: 'amani@scaro.com', role: 'Intern', status: 'Intern' },
  { name: 'Divya', email: 'divya@scaro.com', role: 'Intern', status: 'Intern' },

  // 3 Employees
  { name: 'Madhan', email: 'madhan@scaro.com', role: 'Employee', status: 'Employee' },
  { name: 'Elumalai', email: 'elumalai@scaro.com', role: 'Employee', status: 'Employee' },
  { name: 'Pavan Kumar', email: 'pavankumar@scaro.com', role: 'Employee', status: 'Employee' },

  // 1 Admin
  { name: 'Kumar', email: 'kumar@scaro.com', role: 'Admin', status: 'Employee' },

  // 1 Super Admin
  { name: 'Satish Kumar', email: 'satishkumar@scaro.com', role: 'Super Admin', status: 'Employee' }
];

const OLD_EMAILS = [
  'intern@scaro.com',
  'employee@scaro.com',
  'manager@scaro.com',
  'admin@scaro.com'
];

async function verifyEnvironment() {
  console.log('==================================================');
  console.log('VERIFYING AUTH USERS, PROFILES & ROLE ASSIGNMENTS');
  console.log('==================================================\n');

  // 1. Fetch Auth Users
  const { data: authData, error: authErr } = await supabase.auth.admin.listUsers();
  if (authErr) throw authErr;

  const authUsers = authData.users;
  console.log(`Total Auth Users: ${authUsers.length} (Expected: 15)`);

  // Check for old dev accounts
  const foundOld = authUsers.filter(u => OLD_EMAILS.includes(u.email || ''));
  if (foundOld.length > 0) {
    console.error(`  FAIL: Found old development accounts:`, foundOld.map(u => u.email));
  } else {
    console.log(`  PASS: No old development accounts found (intern@scaro.com is absent)`);
  }

  // 2. Fetch Profiles
  const { data: profiles, error: profErr } = await supabase.from('profiles').select('*');
  if (profErr) throw profErr;
  console.log(`Total Profiles: ${profiles.length} (Expected: 15)`);

  // 3. Fetch User Roles with Role Names
  const { data: userRoles, error: urErr } = await supabase
    .from('user_roles')
    .select('user_id, role_id, roles(name)');
  if (urErr) throw urErr;
  console.log(`Total User Role Assignments: ${userRoles.length} (Expected: 15)`);

  let allUsersValid = true;
  let internCount = 0;
  let employeeCount = 0;
  let adminCount = 0;
  let superAdminCount = 0;

  for (const expected of EXPECTED_USERS) {
    const authUser = authUsers.find(u => u.email?.toLowerCase() === expected.email.toLowerCase());
    if (!authUser) {
      console.error(`  FAIL: Missing auth user for ${expected.email}`);
      allUsersValid = false;
      continue;
    }

    const profile = profiles.find(p => p.id === authUser.id);
    if (!profile) {
      console.error(`  FAIL: Missing profile for ${expected.email} (${authUser.id})`);
      allUsersValid = false;
      continue;
    }

    if (profile.full_name !== expected.name) {
      console.error(`  FAIL: Profile name mismatch for ${expected.email}. Got "${profile.full_name}", expected "${expected.name}"`);
      allUsersValid = false;
    }

    if (!profile.is_active) {
      console.error(`  FAIL: Profile for ${expected.email} is not active`);
      allUsersValid = false;
    }

    // Role verification
    const userRoleEntries = userRoles.filter(ur => ur.user_id === authUser.id);
    if (userRoleEntries.length !== 1) {
      console.error(`  FAIL: User ${expected.email} has ${userRoleEntries.length} role assignments (expected exactly 1)`);
      allUsersValid = false;
      continue;
    }

    const assignedRole = Array.isArray(userRoleEntries[0].roles) 
      ? userRoleEntries[0].roles[0]?.name 
      : userRoleEntries[0].roles?.name;

    if (assignedRole !== expected.role) {
      console.error(`  FAIL: Role mismatch for ${expected.email}. Got "${assignedRole}", expected "${expected.role}"`);
      allUsersValid = false;
    } else {
      if (assignedRole === 'Intern') internCount++;
      else if (assignedRole === 'Employee') employeeCount++;
      else if (assignedRole === 'Admin') adminCount++;
      else if (assignedRole === 'Super Admin') superAdminCount++;
    }
  }

  console.log('\n--- Role Breakdown ---');
  console.log(`  Intern Users: ${internCount}/10 ${internCount === 10 ? '(PASS)' : '(FAIL)'}`);
  console.log(`  Employee Users: ${employeeCount}/3 ${employeeCount === 3 ? '(PASS)' : '(FAIL)'}`);
  console.log(`  Admin User: ${adminCount}/1 ${adminCount === 1 ? '(PASS)' : '(FAIL)'}`);
  console.log(`  Super Admin User: ${superAdminCount}/1 ${superAdminCount === 1 ? '(PASS)' : '(FAIL)'}`);

  const totalExact = authUsers.length === 15 && profiles.length === 15 && userRoles.length === 15;
  console.log(`\nOverall User & Role Integrity: ${allUsersValid && totalExact ? 'PASS' : 'FAIL'}`);
}

verifyEnvironment().catch(err => {
  console.error('Fatal error verifying environment:', err);
  process.exit(1);
});
