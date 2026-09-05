import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../features/auth/AuthContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { InstallAppButton } from '../../components/pwa/InstallAppButton';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  
  const { user, role, loading: authLoading, error: authError } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const logoutSuccessMessage = (location.state as any)?.logoutSuccessMessage || (location.state as any)?.message;

  const getRedirectPath = (userRole: string | null) => {
    switch (userRole) {
      case 'Super Admin':
        return '/app/admin/dashboard';
      case 'Admin':
        return '/app/admin/overview';
      case 'Employee':
        return '/app/dashboard';
      case 'Intern':
        return '/app/intern/dashboard';
      default:
        return '/app/dashboard';
    }
  };

  useEffect(() => {
    // If auth state resolved and user is present and has a role, redirect
    if (!authLoading && user && role) {
      // Avoid redirecting if there was an auth error (like inactive user)
      if (!authError) {
        const from = (location.state as any)?.from?.pathname || getRedirectPath(role);
        navigate(from, { replace: true });
      }
    }
  }, [user, role, authLoading, authError, navigate, location]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setLoginError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setLoginError(error.message);
      setIsLoading(false);
    }
    // If successful, AuthContext will catch the auth state change and trigger the redirect in the useEffect above
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-muted p-4">
      <div className="w-full max-w-md bg-surface p-8 rounded-lg shadow-sm border border-border">
        <div className="text-center mb-6">
          <div className="flex justify-center mb-3">
            <img
              src="/assets/scaro-logo.png"
              alt="SCARO Company Logo"
              className="h-20 w-20 sm:h-24 sm:w-24 object-contain rounded-2xl shadow-sm border border-border/60 bg-[#fbf7f2]"
            />
          </div>
          <h1 className="text-2xl font-bold text-primary mb-1">SCARO ERP</h1>
          <p className="text-content-muted text-sm">Sign in to your account</p>
        </div>

        {logoutSuccessMessage && !authError && !loginError && (
          <div 
            id="attendance-logout-success-banner"
            data-testid="attendance-logout-success-banner"
            className="mb-4 p-3 bg-emerald-50 text-emerald-800 text-sm font-medium rounded-lg border border-emerald-200 flex items-center gap-2"
          >
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{logoutSuccessMessage}</span>
          </div>
        )}

        {authError && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded border border-red-200">
            {authError}
          </div>
        )}
        
        {loginError && !authError && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded border border-red-200">
            {loginError}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <Input
              label="Email Address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@scaro.in"
              required
              disabled={isLoading || authLoading}
            />
          </div>
          <div>
            <div className="relative">
              <Input
                label="Password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                disabled={isLoading || authLoading}
              />
              <button
                type="button"
                className="absolute right-3 top-9 text-content-muted text-sm hover:text-content"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <Button 
            type="submit" 
            className="w-full mt-6" 
            isLoading={isLoading || authLoading}
            disabled={isLoading || authLoading}
          >
            {(isLoading || authLoading) ? 'Signing in...' : 'Sign In'}
          </Button>
        </form>

        <div className="mt-6 pt-5 border-t border-border flex flex-col items-center justify-center gap-2">
          <span className="text-[11px] font-medium text-content-muted uppercase tracking-wider">
            Mobile & Desktop Access
          </span>
          <InstallAppButton className="w-full" />
        </div>
      </div>
    </div>
  );
};
