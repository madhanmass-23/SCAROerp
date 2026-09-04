import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '../../components/ui/Card';
import { LoadingState } from '../../components/ui/LoadingState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Button } from '../../components/ui/Button';
import {
  Users,
  GraduationCap,
  Briefcase,
  Calendar,
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { fetchManagementMetrics } from '../../services/managementService';
import type { ManagementMetrics } from '../../types/management';
import { AttendanceReportCorrelation } from '../../components/management/AttendanceReportCorrelation';
import { BlockersAndRequirements } from '../../components/management/BlockersAndRequirements';
import { SyncHealthMonitor } from '../../components/management/SyncHealthMonitor';
import { PersonWorkProfileModal } from '../../components/management/PersonWorkProfileModal';
import { TeamWorkloadOverview } from '../../components/management/TeamWorkloadOverview';
import { WorkActivityTrends } from '../../components/management/WorkActivityTrends';
import { useNavigate } from 'react-router-dom';

export const SuperAdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<ManagementMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Modal / Deep Dive State
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  const loadMetrics = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchManagementMetrics();
      setMetrics(res);
    } catch (err: any) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMetrics();
  }, []);

  const handleSelectPerson = (userId: string) => {
    setSelectedUserId(userId);
    setIsProfileModalOpen(true);
  };

  const handleSelectReport = (reportId: string) => {
    navigate(`/app/reports?reportId=${reportId}`);
  };

  if (loading && !metrics) return <LoadingState text="Loading executive metrics..." />;
  if (error) return <ErrorState title="Failed to load metrics" message={error.message} onRetry={loadMetrics} />;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-content">Super Admin Intelligence</h1>
          <p className="text-xs text-content-muted mt-1">
            Company-wide workforce operations, daily report compliance, and sync monitoring.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadMetrics} className="gap-1.5 self-start sm:self-auto text-xs">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh Metrics
        </Button>
      </div>

      {/* Top Level Summary Cards (Restrained, 8 essential cards in 4x2 grid) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg shrink-0">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div className="truncate">
                <p className="text-xs font-medium text-content-muted truncate">Total Employees</p>
                <p className="text-xl font-bold text-content">{metrics?.totalEmployees}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg shrink-0">
                <GraduationCap className="h-5 w-5 text-primary" />
              </div>
              <div className="truncate">
                <p className="text-xs font-medium text-content-muted truncate">Total Interns</p>
                <p className="text-xl font-bold text-content">{metrics?.totalInterns}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-status-success/10 rounded-lg shrink-0">
                <Calendar className="h-5 w-5 text-status-success" />
              </div>
              <div className="truncate">
                <p className="text-xs font-medium text-content-muted truncate">Checked In Today</p>
                <p className="text-xl font-bold text-content">{metrics?.checkedInToday}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-status-success/10 rounded-lg shrink-0">
                <CheckCircle2 className="h-5 w-5 text-status-success" />
              </div>
              <div className="truncate">
                <p className="text-xs font-medium text-content-muted truncate">Reports Submitted</p>
                <p className="text-xl font-bold text-content">{metrics?.reportsSubmittedToday}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-status-warning/10 rounded-lg shrink-0">
                <Clock className="h-5 w-5 text-status-warning" />
              </div>
              <div className="truncate">
                <p className="text-xs font-medium text-content-muted truncate">Reports Pending</p>
                <p className="text-xl font-bold text-content">{metrics?.reportsPendingToday}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-status-danger/10 rounded-lg shrink-0">
                <AlertCircle className="h-5 w-5 text-status-danger" />
              </div>
              <div className="truncate">
                <p className="text-xs font-medium text-content-muted truncate">Reported Blockers</p>
                <p className="text-xl font-bold text-content">{metrics?.reportedBlockersCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg shrink-0">
                <Briefcase className="h-5 w-5 text-primary" />
              </div>
              <div className="truncate">
                <p className="text-xs font-medium text-content-muted truncate">Active Projects</p>
                <p className="text-xl font-bold text-content">{metrics?.activeProjects}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-surface-muted rounded-lg shrink-0">
                <Users className="h-5 w-5 text-content-muted" />
              </div>
              <div className="truncate">
                <p className="text-xs font-medium text-content-muted truncate">Active Accounts</p>
                <p className="text-xl font-bold text-content">{metrics?.activeUsers}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Workforce Team Workload Overview */}
      <TeamWorkloadOverview onSelectPerson={handleSelectPerson} />

      {/* Workforce Activity Trends */}
      <WorkActivityTrends />

      {/* Primary Section: Today's Workforce & Report Correlation */}
      <AttendanceReportCorrelation
        onSelectPerson={handleSelectPerson}
        onSelectReport={handleSelectReport}
      />

      {/* Grid: Reported Blockers & Google Sheets Sync Health */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <BlockersAndRequirements onSelectReport={handleSelectReport} />
        <SyncHealthMonitor onSelectReport={handleSelectReport} />
      </div>

      {/* Person Work Profile Modal */}
      <PersonWorkProfileModal
        userId={selectedUserId}
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        onSelectReport={handleSelectReport}
      />
    </div>
  );
};

