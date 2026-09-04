import React from 'react';
import { NavLink } from 'react-router-dom';
import { cn } from '../components/ui/Button';
import { LayoutDashboard, CheckSquare, Briefcase, Calendar, Users, FileText, MessageSquare, Bell, Shield, User as UserIcon } from 'lucide-react';
import { useAuth } from '../features/auth/AuthContext';
import { InstallAppButton } from '../components/pwa/InstallAppButton';

interface SidebarProps {
  isMobileOpen: boolean;
  onMobileClose: () => void;
}

interface NavItem {
  name: string;
  href: string;
  icon: any;
  roles?: string[]; // If undefined, available to all roles
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const NAVIGATION: NavSection[] = [
  {
    title: 'Work',
    items: [
      { name: 'Admin Dashboard', href: '/app/admin/dashboard', icon: LayoutDashboard, roles: ['Super Admin'] },
      { name: 'Admin Overview', href: '/app/admin/overview', icon: LayoutDashboard, roles: ['Admin'] },
      { name: 'Dashboard', href: '/app/dashboard', icon: LayoutDashboard, roles: ['Employee'] },
      { name: 'Dashboard', href: '/app/intern/dashboard', icon: LayoutDashboard, roles: ['Intern'] },
      { name: 'Tasks', href: '/app/tasks', icon: CheckSquare },
      { name: 'Projects', href: '/app/projects', icon: Briefcase, roles: ['Super Admin', 'Admin', 'Employee'] },
    ],
  },
  {
    title: 'People & Teams',
    items: [
      { name: 'People', href: '/app/people', icon: Users, roles: ['Super Admin', 'Admin'] },
      { name: 'Attendance', href: '/app/attendance', icon: Calendar },
      { name: 'Meetings', href: '/app/meetings', icon: Users },
      { name: 'Leave', href: '/app/leave', icon: Calendar },
      { name: 'Daily Report', href: '/app/tracker', icon: FileText, roles: ['Employee', 'Intern'] },
      { name: 'Reports', href: '/app/reports', icon: FileText, roles: ['Super Admin', 'Admin'] },
    ],
  },
  {
    title: 'Communication',
    items: [
      { name: 'Messages', href: '/app/messages', icon: MessageSquare },
      { name: 'Notifications', href: '/app/notifications', icon: Bell },
      { name: 'Announcements', href: '/app/announcements', icon: Bell, roles: ['Super Admin', 'Admin'] },
    ],
  },
  {
    title: 'Administration',
    items: [
      { name: 'Profile', href: '/app/profile', icon: UserIcon },
      { name: 'Audit Logs', href: '/app/audit-logs', icon: Shield, roles: ['Super Admin'] },
      { name: 'Company Settings', href: '/app/admin/settings', icon: Shield, roles: ['Super Admin'] },
    ],
  }
];

export const Sidebar: React.FC<SidebarProps> = ({ isMobileOpen, onMobileClose }) => {
  const { user, profile, role } = useAuth();

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div 
          className="fixed inset-0 bg-content/50 z-40 lg:hidden"
          onClick={onMobileClose}
        />
      )}

      {/* Sidebar Container */}
      <aside className={cn(
        "fixed lg:static inset-y-0 left-0 z-50 w-64 bg-surface border-r border-border flex flex-col transition-transform duration-200 ease-in-out lg:transform-none",
        isMobileOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-5 border-b border-border flex items-center gap-3">
          <img
            src="/assets/scaro-logo.png"
            alt="SCARO Logo"
            className="h-9 w-9 object-contain rounded-lg border border-border/50 bg-[#fbf7f2] shadow-xs shrink-0"
          />
          <div>
            <h2 className="text-xl font-bold text-primary leading-tight">SCARO</h2>
            <p className="text-[10px] text-content-muted uppercase tracking-wider font-semibold">Enterprise ERP</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-4 space-y-8">
          {NAVIGATION.map((section) => {
            const filteredItems = section.items.filter(item => !item.roles || (role && item.roles.includes(role)));
            
            if (filteredItems.length === 0) return null;

            return (
              <div key={section.title}>
                <h3 className="px-3 text-xs font-semibold text-content-muted uppercase tracking-wider mb-2">
                  {section.title}
                </h3>
                <div className="space-y-1">
                  {filteredItems.map((item) => (
                    <NavLink
                      key={item.name}
                      to={item.href}
                      onClick={onMobileClose}
                      className={({ isActive }) => cn(
                        "flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors",
                        isActive 
                          ? "bg-primary/10 text-primary" 
                          : "text-content hover:bg-surface-muted"
                      )}
                    >
                      <item.icon className="mr-3 h-5 w-5" />
                      {item.name}
                    </NavLink>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="px-4 py-2 border-t border-border">
          <InstallAppButton className="w-full" />
        </div>

        <div className="p-4 border-t border-border flex items-center">
          <div className="flex-shrink-0">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt={profile.full_name} className="h-8 w-8 rounded-full object-cover border border-border" />
            ) : (
              <span className="inline-block h-8 w-8 rounded-full bg-surface-muted flex items-center justify-center text-primary font-bold">
                {profile?.display_name ? profile.display_name.charAt(0).toUpperCase() : user?.email?.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div className="ml-3 truncate">
            <p className="text-sm font-medium text-content truncate">{profile?.display_name || user?.email}</p>
            <p className="text-xs font-medium text-content-muted truncate">{role || 'No Role'}</p>
          </div>
        </div>
      </aside>
    </>
  );
};
