-- Seed data for SCARO ERP Core Entities

-- 1. Insert Core Roles
INSERT INTO public.roles (id, name, description) VALUES 
  ('11111111-1111-1111-1111-111111111111', 'Super Admin', 'Full access to all system features and data.'),
  ('22222222-2222-2222-2222-222222222222', 'Admin', 'Administrative access with specific scoped permissions.'),
  ('33333333-3333-3333-3333-333333333333', 'Employee', 'Standard employee access.'),
  ('44444444-4444-4444-4444-444444444444', 'Intern', 'Limited access for interns.')
ON CONFLICT (name) DO NOTHING;

-- 2. Insert Permissions
INSERT INTO public.permissions (id, name, description) VALUES
  (gen_random_uuid(), 'users.view', 'Can view all users in the organization'),
  (gen_random_uuid(), 'users.manage', 'Can create, update, and manage users and departments'),
  
  (gen_random_uuid(), 'projects.view', 'Can view all projects'),
  (gen_random_uuid(), 'projects.manage', 'Can create, update, and delete projects'),
  
  (gen_random_uuid(), 'tasks.view', 'Can view all tasks'),
  (gen_random_uuid(), 'tasks.create', 'Can create tasks'),
  (gen_random_uuid(), 'tasks.update', 'Can update tasks'),
  (gen_random_uuid(), 'tasks.manage', 'Can delete and manage any task'),
  
  (gen_random_uuid(), 'attendance.view', 'Can view attendance for all users'),
  (gen_random_uuid(), 'attendance.manage', 'Can correct and modify attendance records'),
  
  (gen_random_uuid(), 'meetings.view', 'Can view all meetings'),
  (gen_random_uuid(), 'meetings.manage', 'Can manage all meetings'),
  
  (gen_random_uuid(), 'reports.view', 'Can view daily reports of all users'),
  (gen_random_uuid(), 'reports.manage', 'Can manage daily reports'),
  
  (gen_random_uuid(), 'announcements.view', 'Can view all announcements'),
  (gen_random_uuid(), 'announcements.manage', 'Can create and manage announcements'),
  
  (gen_random_uuid(), 'leave.view', 'Can view all leave requests'),
  (gen_random_uuid(), 'leave.manage', 'Can review and manage leave requests'),
  
  (gen_random_uuid(), 'audit.view', 'Can view system audit logs')
ON CONFLICT (name) DO NOTHING;

-- 3. Assign Permissions to Roles (Admin gets most, Super Admin already bypasses via functions)
DO $$
DECLARE
    admin_role_id UUID;
    perm_record RECORD;
BEGIN
    SELECT id INTO admin_role_id FROM public.roles WHERE name = 'Admin';
    
    FOR perm_record IN SELECT id FROM public.permissions
    LOOP
        INSERT INTO public.role_permissions (role_id, permission_id) 
        VALUES (admin_role_id, perm_record.id)
        ON CONFLICT DO NOTHING;
    END LOOP;
END
$$;

-- 4. Initialize Company Settings
INSERT INTO public.company_settings (company_name, timezone) 
VALUES ('SCARO', 'Asia/Kolkata')
ON CONFLICT (is_singleton) DO UPDATE SET 
  company_name = EXCLUDED.company_name,
  timezone = EXCLUDED.timezone;

-- Note on Super Admin Creation:
-- DO NOT insert plain text passwords or fake auth.users rows here. 
-- In a real environment, the first user creates an account via Supabase Auth.
-- Then, an operator accesses the Supabase Dashboard, copies the `auth.users` UUID, 
-- and manually inserts a row into `public.user_roles` linking that UUID to the Super Admin role ID.;