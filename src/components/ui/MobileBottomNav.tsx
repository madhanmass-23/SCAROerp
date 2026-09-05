import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  CheckSquare, 
  FileText, 
  Calendar, 
  Menu, 
  Briefcase, 
  Users, 
  MessageSquare, 
  Bell, 
  User as UserIcon, 
  Shield, 
  LogOut, 
  Megaphone 
} from 'lucide-react';
import { useAuth } from '../../features/auth/AuthContext';
import { Drawer } from './Drawer';
import { cn } from './Button';
import { useToast } from './Toast';
import { executeAppLogout } from '../../services/authWorkflowService';

export const MobileBottomNav: React.FC = () => {
  const { user, profile, role } = useAuth();
  const { showError } = useToast();
  const navigate = useNavigate();
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  // Determine home link based on role
  let homeHref = '/app/dashboard';
  if (role === 'Super Admin') homeHref = '/app/admin/dashboard';
  else if (role === 'Admin') homeHref = '/app/admin/overview';
  else if (role === 'Intern') homeHref = '/app/intern/dashboard';

  const isSupervisor = role === 'Super Admin' || role === 'Admin';
  const trackerHref = isSupervisor ? '/app/reports' : '/app/tracker';
  const trackerLabel = isSupervisor ? 'Reports' : 'Daily Report';

  const handleLogout = async () => {
    setIsMoreOpen(false);
    await executeAppLogout({
      userId: user?.id,
      role,
      navigate,
      onBlockLogout: (msg) => showError(msg),
    });
  };

  const navItemClass = ({ isActive }: { isActive: boolean }) => cn(
    'flex flex-col items-center justify-center flex-1 py-2 text-[10px] font-medium transition-colors',
    isActive ? 'text-primary' : 'text-content-muted hover:text-content'
  );

  return (
    <>
      <nav 
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface border-t border-border shadow-lg flex items-center justify-around h-16 px-1 safe-area-pb"
        aria-label="Mobile Bottom Navigation"
      >
        <NavLink to={homeHref} className={navItemClass}>
          <LayoutDashboard className="h-5 w-5 mb-0.5" />
          <span>Home</span>
        </NavLink>

        <NavLink to="/app/tasks" className={navItemClass}>
          <CheckSquare className="h-5 w-5 mb-0.5" />
          <span>Tasks</span>
        </NavLink>

        <NavLink to={trackerHref} className={navItemClass}>
          <FileText className="h-5 w-5 mb-0.5" />
          <span>{trackerLabel}</span>
        </NavLink>

        <NavLink to="/app/attendance" className={navItemClass}>
          <Calendar className="h-5 w-5 mb-0.5" />
          <span>Work Time</span>
        </NavLink>

        <button 
          type="button"
          onClick={() => setIsMoreOpen(true)}
          className="flex flex-col items-center justify-center flex-1 py-2 text-[10px] font-medium text-content-muted hover:text-content transition-colors"
          aria-label="Open more menu"
        >
          <Menu className="h-5 w-5 mb-0.5" />
          <span>More</span>
        </button>
      </nav>

      {/* Slide-over Drawer for More Options */}
      <Drawer
        isOpen={isMoreOpen}
        onClose={() => setIsMoreOpen(false)}
        title={
          <div className="flex items-center gap-2">
            <img
              src="/assets/scaro-logo.png"
              alt="SCARO Logo"
              className="h-6 w-6 object-contain rounded-md border border-border/40 bg-[#fbf7f2] shadow-2xs"
            />
            <span className="font-bold text-primary">Workspace Navigation</span>
          </div>
        }
        position="right"
      >
        <div className="flex items-center gap-3 p-3 bg-surface-muted rounded-lg border border-border mb-4">
          <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-base">
            {profile?.full_name?.charAt(0) || user?.email?.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-content truncate">{profile?.full_name || user?.email}</p>
            <p className="text-xs text-content-muted truncate">{role || 'Team Member'}</p>
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-[11px] font-semibold text-content-muted uppercase tracking-wider px-3 mb-1">Modules</p>
          
          {role !== 'Intern' && (
            <NavLink
              to="/app/projects"
              onClick={() => setIsMoreOpen(false)}
              className={({ isActive }) => cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
                isActive ? 'bg-primary/10 text-primary' : 'text-content hover:bg-surface-muted'
              )}
            >
              <Briefcase className="h-4 w-4" /> Projects
            </NavLink>
          )}

          <NavLink
            to="/app/meetings"
            onClick={() => setIsMoreOpen(false)}
            className={({ isActive }) => cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
              isActive ? 'bg-primary/10 text-primary' : 'text-content hover:bg-surface-muted'
            )}
          >
            <Users className="h-4 w-4" /> Meetings
          </NavLink>

          <NavLink
            to="/app/leave"
            onClick={() => setIsMoreOpen(false)}
            className={({ isActive }) => cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
              isActive ? 'bg-primary/10 text-primary' : 'text-content hover:bg-surface-muted'
            )}
          >
            <Calendar className="h-4 w-4" /> Leave Management
          </NavLink>

          <NavLink
            to="/app/messages"
            onClick={() => setIsMoreOpen(false)}
            className={({ isActive }) => cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
              isActive ? 'bg-primary/10 text-primary' : 'text-content hover:bg-surface-muted'
            )}
          >
            <MessageSquare className="h-4 w-4" /> Direct Messages
          </NavLink>

          <NavLink
            to="/app/notifications"
            onClick={() => setIsMoreOpen(false)}
            className={({ isActive }) => cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
              isActive ? 'bg-primary/10 text-primary' : 'text-content hover:bg-surface-muted'
            )}
          >
            <Bell className="h-4 w-4" /> Notifications
          </NavLink>

          {isSupervisor && (
            <>
              <NavLink
                to="/app/people"
                onClick={() => setIsMoreOpen(false)}
                className={({ isActive }) => cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
                  isActive ? 'bg-primary/10 text-primary' : 'text-content hover:bg-surface-muted'
                )}
              >
                <Users className="h-4 w-4" /> People
              </NavLink>

              <NavLink
                to="/app/announcements"
                onClick={() => setIsMoreOpen(false)}
                className={({ isActive }) => cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
                  isActive ? 'bg-primary/10 text-primary' : 'text-content hover:bg-surface-muted'
                )}
              >
                <Megaphone className="h-4 w-4" /> Announcements
              </NavLink>
            </>
          )}

          {role === 'Super Admin' && (
            <>
              <p className="text-[11px] font-semibold text-content-muted uppercase tracking-wider px-3 mt-4 mb-1">Administration</p>
              <NavLink
                to="/app/audit-logs"
                onClick={() => setIsMoreOpen(false)}
                className={({ isActive }) => cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
                  isActive ? 'bg-primary/10 text-primary' : 'text-content hover:bg-surface-muted'
                )}
              >
                <Shield className="h-4 w-4" /> Audit Logs
              </NavLink>

              <NavLink
                to="/app/admin/settings"
                onClick={() => setIsMoreOpen(false)}
                className={({ isActive }) => cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
                  isActive ? 'bg-primary/10 text-primary' : 'text-content hover:bg-surface-muted'
                )}
              >
                <Shield className="h-4 w-4" /> Company Settings
              </NavLink>
            </>
          )}

          <p className="text-[11px] font-semibold text-content-muted uppercase tracking-wider px-3 mt-4 mb-1">Account</p>

          <NavLink
            to="/app/profile"
            onClick={() => setIsMoreOpen(false)}
            className={({ isActive }) => cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
              isActive ? 'bg-primary/10 text-primary' : 'text-content hover:bg-surface-muted'
            )}
          >
            <UserIcon className="h-4 w-4" /> My Profile
          </NavLink>

          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-status-danger hover:bg-red-50 transition-colors text-left"
          >
            <LogOut className="h-4 w-4" /> Logout
          </button>
        </div>
      </Drawer>
    </>
  );
};
