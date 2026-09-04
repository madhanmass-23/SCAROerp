import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './features/auth/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppLayout } from './layouts/AppLayout';
import { ToastProvider } from './components/ui/Toast';
import { Login } from './pages/auth/Login';
import { SuperAdminDashboard } from './pages/admin/SuperAdminDashboard';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { EmployeeDashboard } from './pages/dashboard/EmployeeDashboard';
import { InternDashboard } from './pages/dashboard/InternDashboard';
import { TasksPage } from './pages/tasks/TasksPage';
import { ProjectsPage } from './pages/projects/ProjectsPage';
import { ReportsPage } from './pages/reports/ReportsPage';
import { DailyTrackerPage } from './pages/reports/DailyTrackerPage';
import { MessagesPage } from './pages/messages/MessagesPage';
import { ProfilePage } from './pages/profile/ProfilePage';
import { AttendancePage } from './pages/attendance/AttendancePage';
import { MeetingsPage } from './pages/meetings/MeetingsPage';
import { NotificationsPage } from './pages/notifications/NotificationsPage';
import { LeavePage } from './pages/leave/LeavePage';
import { PeoplePage } from './pages/people/PeoplePage';
import { AnnouncementsPage } from './pages/announcements/AnnouncementsPage';
import { AuditLogsPage } from './pages/admin/AuditLogsPage';
import { CompanySettingsPage } from './pages/admin/CompanySettingsPage';
import { DailyCheckinInterceptor } from './components/DailyCheckinInterceptor';

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            
            <Route element={<ProtectedRoute />}>
              <Route path="/app" element={
                <DailyCheckinInterceptor>
                  <AppLayout />
                </DailyCheckinInterceptor>
              }>
                {/* Role-Specific Dashboards */}
                <Route element={<ProtectedRoute allowedRoles={['Super Admin']} />}>
                  <Route path="admin/dashboard" element={<SuperAdminDashboard />} />
                  <Route path="audit-logs" element={<AuditLogsPage />} />
                  <Route path="admin/settings" element={<CompanySettingsPage />} />
                </Route>
                <Route element={<ProtectedRoute allowedRoles={['Admin']} />}>
                  <Route path="admin/overview" element={<AdminDashboard />} />
                </Route>
                <Route element={<ProtectedRoute allowedRoles={['Employee']} />}>
                  <Route path="dashboard" element={<EmployeeDashboard />} />
                </Route>
                <Route element={<ProtectedRoute allowedRoles={['Intern']} />}>
                  <Route path="intern/dashboard" element={<InternDashboard />} />
                </Route>

                {/* Management / Company Directory (Admin & Super Admin only) */}
                <Route element={<ProtectedRoute allowedRoles={['Super Admin', 'Admin']} />}>
                  <Route path="people" element={<PeoplePage />} />
                </Route>

                {/* Shared Modules */}
                <Route path="tasks" element={<TasksPage />} />
                <Route path="projects" element={<ProjectsPage />} />
                <Route path="attendance" element={<AttendancePage />} />
                <Route path="meetings" element={<MeetingsPage />} />
                <Route path="leave" element={<LeavePage />} />
                <Route path="tracker" element={<DailyTrackerPage />} />
                <Route path="reports" element={<ReportsPage />} />
                <Route path="messages" element={<MessagesPage />} />
                <Route path="notifications" element={<NotificationsPage />} />
                <Route path="profile" element={<ProfilePage />} />
                <Route path="announcements" element={<AnnouncementsPage />} />
              </Route>
              {/* Root redirect to generic dashboard which ProtectedRoute handles via fallback */}
              <Route path="/" element={<Navigate to="/app/dashboard" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;
