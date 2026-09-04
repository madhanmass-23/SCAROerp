import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User, AuthChangeEvent } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';

export interface UserProfile {
  id: string;
  email?: string;
  full_name: string;
  display_name: string;
  avatar_url?: string;
  phone?: string;
  designation?: string;
  department_id?: string;
  department_name?: string;
  employment_status?: string;
  is_active: boolean;
  linkedin?: string;
  github?: string;
  joining_date?: string;
}

export interface AuthState {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  role: string | null;
  loading: boolean;
  error: string | null;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({ 
  session: null, 
  user: null, 
  profile: null,
  role: null,
  loading: true,
  error: null,
  refreshProfile: async () => {}
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>({ 
    session: null, 
    user: null, 
    profile: null, 
    role: null, 
    loading: true, 
    error: null,
    refreshProfile: async () => {}
  });

  const fetchProfileAndRole = async (user: User | null, session: Session | null) => {
    if (!user) {
      setState(prev => ({ 
        ...prev, 
        session, 
        user: null, 
        profile: null, 
        role: null, 
        loading: false, 
        error: null 
      }));
      return;
    }

    try {
      const { data: profileData, error: profileErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profileErr) throw new Error('Failed to fetch profile: ' + profileErr.message);

      if (!profileData?.is_active) {
        throw new Error('Your account is currently disabled. Please contact an administrator.');
      }

      // Fetch department name if department_id is assigned
      let departmentName = 'General';
      if (profileData.department_id) {
        const { data: deptData } = await supabase
          .from('departments')
          .select('name')
          .eq('id', profileData.department_id)
          .maybeSingle();
        if (deptData?.name) departmentName = deptData.name;
      }

      // Fetch role mapping
      const { data: roleData, error: roleErr } = await supabase
        .from('user_roles')
        .select('roles(name)')
        .eq('user_id', user.id)
        .single();
        
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const roleMapping: any = roleData;

      if (roleErr) throw new Error('Failed to fetch user role: ' + roleErr.message);

      // Extract role name safely based on PostgREST shape (object or array depending on relation)
      let roleName = null;
      if (roleMapping?.roles) {
        if (Array.isArray(roleMapping.roles)) {
          roleName = roleMapping.roles[0]?.name;
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          roleName = (roleMapping.roles as any).name;
        }
      }

      if (!roleName) throw new Error('No application role assigned to this account.');

      const userProfile: UserProfile = {
        id: profileData.id,
        email: profileData.email || user.email,
        full_name: profileData.full_name || '',
        display_name: profileData.full_name || user.email || 'User',
        avatar_url: profileData.avatar_url,
        phone: profileData.phone,
        designation: profileData.designation || 'Team Member',
        department_id: profileData.department_id,
        department_name: departmentName,
        employment_status: profileData.employment_status || 'Employee',
        is_active: profileData.is_active ?? true,
        linkedin: profileData.linkedin,
        github: profileData.github,
        joining_date: profileData.joining_date,
      };

      setState({
        session,
        user,
        profile: userProfile,
        role: roleName,
        loading: false,
        error: null,
        refreshProfile: async () => {
          await fetchProfileAndRole(user, session);
        }
      });

    } catch (err: unknown) {
      setState(prev => ({
        ...prev,
        session,
        user,
        profile: null,
        role: null,
        loading: false,
        error: err instanceof Error ? err.message : 'An unknown authentication error occurred'
      }));
      // Optionally sign out the user if profile/role fails
      await supabase.auth.signOut();
    }
  };

  useEffect(() => {
    // 1. Initial check
    supabase.auth.getSession().then(({ data: { session } }) => {
      fetchProfileAndRole(session?.user || null, session);
    });

    // 2. Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        setState(s => ({ ...s, loading: true, error: null }));
        fetchProfileAndRole(session?.user || null, session);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={state}>
      {children}
    </AuthContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);
