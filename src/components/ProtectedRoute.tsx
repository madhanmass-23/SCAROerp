import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';
import { LoadingState } from './ui/LoadingState';

interface ProtectedRouteProps {
  allowedRoles?: string[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ allowedRoles }) => {
  const { user, role, loading, error } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <LoadingState text="Verifying session..." showLogo={true} />
      </div>
    );
  }

  if (!user || error) {
    // Redirect to login if unauthenticated or if there's an auth error (like inactive user)
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && role && !allowedRoles.includes(role)) {
    // User is authenticated but doesn't have the required role
    // Redirect to their respective default dashboard
    if (role === 'Super Admin') return <Navigate to="/app/admin/dashboard" replace />;
    if (role === 'Admin') return <Navigate to="/app/admin/overview" replace />;
    if (role === 'Employee') return <Navigate to="/app/dashboard" replace />;
    if (role === 'Intern') return <Navigate to="/app/intern/dashboard" replace />;
    
    // Fallback
    return <Navigate to="/app/dashboard" replace />;
  }

  return <Outlet />;
};
