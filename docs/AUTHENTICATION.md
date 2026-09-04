# SCARO ERP Authentication

## Overview
SCARO ERP uses Supabase Authentication with a robust role-based access control (RBAC) system. The authentication flow handles everything from initial login to route protection and role-aware navigation.

## 1. Authentication Flow
1. User logs in via the UI (`src/pages/auth/Login.tsx`) using Email and Password.
2. The Supabase JS Client handles the login and sets the session securely (managed automatically in `AuthContext`).
3. `AuthContext` listens for session changes (`onAuthStateChange`).
4. Upon successful login, the application performs additional lookups to build the full session context:
   - Fetches the user's `profile` (checking `is_active`).
   - Fetches the user's `role` via `user_roles` mapping.
5. If the account is disabled, the system displays an error message and redirects back to the login screen.
6. Based on the resolved `role`, the user is redirected to their specific dashboard landing page.

## 2. Profile & Role Resolution
Roles are resolved securely from the server database without relying on frontend hardcoding.
- `public.profiles`: Stores display names, active status, etc.
- `public.roles`: The canonical list of allowed application roles.
- `public.user_roles`: The mapping table connecting `auth.users` to `public.roles`.

## 3. Route Protection
We utilize a `ProtectedRoute` component (`src/components/ProtectedRoute.tsx`) that conditionally allows access to nested routes.
- **Base Protection**: Checks if the user is logged in.
- **Role-Aware Protection**: Accepts an `allowedRoles` array (e.g., `['Super Admin', 'Admin']`). If a user attempts to access a protected route without the correct role, they are redirected to their own valid dashboard.

## 4. Role-Aware Navigation
The `Sidebar.tsx` dynamically configures the navigation menu by checking each `NavItem`'s `roles` array against the authenticated user's role.
- If no `roles` array is present on the item, it is visible to all authenticated users.
- If a `roles` array is present, the item is strictly filtered out for unauthorized users.

## 5. Development User Provisioning
Development environments include four initial users: Super Admin, Admin, Employee, and Intern.
These users are provisioned using a secure script (`scripts/provision-dev-users.mjs`) that utilizes the `SUPABASE_SERVICE_ROLE_KEY` to securely bypass RLS and create accounts/profiles directly. 

**Note**: To securely manage keys:
- Frontend credentials (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`) are stored in `.env.local`.
- Administrative credentials (`SUPABASE_SERVICE_ROLE_KEY`) are stored in `.env.admin.local`.
- Both files are strictly excluded from source control via `.gitignore`.
- **Never expose the service-role key to the frontend application.**
