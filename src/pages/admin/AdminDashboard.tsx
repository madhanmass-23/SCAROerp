import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '../../components/ui/Card';
import { LoadingState } from '../../components/ui/LoadingState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Button } from '../../components/ui/Button';
import {
  Users,
  Briefcase,
  CheckSquare,
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
import { PersonWorkProfileModal } from '../../components/management/PersonWorkProfileModal';
import { TeamWorkloadOverview } from '../../components/management/TeamWorkloadOverview';
import { WorkActivityTrends } from '../../components/management/WorkActivityTrends';
import { useNavigate } from 'react-router-dom';

export const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<ManagementMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Modal State
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

  if (loading && !metrics) return <LoadingState text="Loading team operational metrics..." />;
  if (error) return <ErrorState title="Failed to load metrics" message={error.message} onRetry={loadMetrics} />;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-content">Operations & Team Control</h1>
          <p className="text-xs text-content-muted mt-1">
            Real-time workforce attendance, daily report submissions, and blocker supervision.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadMetrics} className="gap-1.5 self-start sm:self-auto text-xs">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {/* Top Level Operational Summary Cards (7 cards) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <Card>
          <CardContent className="p-3.5">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-primary/10 rounded-lg shrink-0">
                <Users className="h-4 w-4 text-primary" />
              </div>
              <div className="truncate">
                <p className="text-xs font-medium text-content-muted truncate">Team Members</p>
                <p className="text-lg font-bold text-content">{(metrics?.totalEmployees || 0) + (metrics?.totalInterns || 0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3.5">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-status-success/10 rounded-lg shrink-0">
                <Calendar className="h-4 w-4 text-status-success" />
              </div>
              <div className="truncate">
                <p className="text-xs font-medium text-content-muted truncate">Checked In</p>
                <p className="text-lg font-bold text-content">{metrics?.checkedInToday}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3.5">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-status-success/10 rounded-lg shrink-0">
                <CheckCircle2 className="h-4 w-4 text-status-success" />
              </div>
              <div className="truncate">
                <p className="text-xs font-medium text-content-muted truncate">Reports Done</p>
                <p className="text-lg font-bold text-content">{metrics?.reportsSubmittedToday}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3.5">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-status-warning/10 rounded-lg shrink-0">
                <Clock className="h-4 w-4 text-status-warning" />
              </div>
              <div className="truncate">
                <p className="text-xs font-medium text-content-muted truncate">Pending</p>
                <p className="text-lg font-bold text-content">{metrics?.reportsPendingToday}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3.5">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-status-danger/10 rounded-lg shrink-0">
                <AlertCircle className="h-4 w-4 text-status-danger" />
              </div>
              <div className="truncate">
                <p className="text-xs font-medium text-content-muted truncate">Blockers</p>
                <p className="text-lg font-bold text-content">{metrics?.reportedBlockersCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3.5">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-primary/10 rounded-lg shrink-0">
                <CheckSquare className="h-4 w-4 text-primary" />
              </div>
              <div className="truncate">
                <p className="text-xs font-medium text-content-muted truncate">Active Tasks</p>
                <p className="text-lg font-bold text-content">{metrics?.activeTasks}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-2 sm:col-span-1">
          <CardContent className="p-3.5">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-primary/10 rounded-lg shrink-0">
                <Briefcase className="h-4 w-4 text-primary" />
              </div>
              <div className="truncate">
                <p className="text-xs font-medium text-content-muted truncate">Projects</p>
                <p className="text-lg font-bold text-content">{metrics?.activeProjects}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Team Workload Overview */}
      <TeamWorkloadOverview onSelectPerson={handleSelectPerson} />

      {/* Workforce Activity Trends */}
      <WorkActivityTrends />

      {/* Workforce Attendance & Report Correlation View */}
      <AttendanceReportCorrelation
        onSelectPerson={handleSelectPerson}
        onSelectReport={handleSelectReport}
      />

      {/* Reported Blockers and Company Requirements */}
      <BlockersAndRequirements onSelectReport={handleSelectReport} />

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
