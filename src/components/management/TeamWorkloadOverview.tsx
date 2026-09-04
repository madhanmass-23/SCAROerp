import React, { useEffect, useState } from 'react';
import { LoadingState } from '../ui/LoadingState';
import { ErrorState } from '../ui/ErrorState';
import { Button } from '../ui/Button';
import {
  Users,
  Search,
  CheckSquare,
  AlertCircle,
  Briefcase,
  Filter,
  ArrowUpDown,
  ExternalLink,
} from 'lucide-react';
import { fetchTeamWorkloadIntelligence } from '../../services/managementService';
import type { TeamWorkloadMember } from '../../types/management';

interface Props {
  onSelectPerson: (userId: string) => void;
}

type SortField = 'name' | 'activeTasks' | 'overdueTasks' | 'completedTasks';

export const TeamWorkloadOverview: React.FC<Props> = ({ onSelectPerson }) => {
  const [members, setMembers] = useState<TeamWorkloadMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Filters and sorting
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'All' | 'Employee' | 'Intern'>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortAsc, setSortAsc] = useState(true);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchTeamWorkloadIntelligence();
      setMembers(data);
    } catch (err: any) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filter logic
  const filtered = members.filter((m) => {
    const matchesSearch =
      m.fullName.toLowerCase().includes(search.toLowerCase()) ||
      m.email.toLowerCase().includes(search.toLowerCase()) ||
      (m.departmentName && m.departmentName.toLowerCase().includes(search.toLowerCase()));

    const matchesRole = roleFilter === 'All' || m.role === roleFilter;
    const matchesStatus = statusFilter === 'All' || m.todayStatus === statusFilter;

    return matchesSearch && matchesRole && matchesStatus;
  });

  // Sort logic (Neutral operational sorting only)
  const sorted = [...filtered].sort((a, b) => {
    let diff = 0;
    if (sortField === 'name') {
      diff = a.fullName.localeCompare(b.fullName);
    } else if (sortField === 'activeTasks') {
      diff = a.activeTasksCount - b.activeTasksCount;
    } else if (sortField === 'overdueTasks') {
      diff = a.overdueCount - b.overdueCount;
    } else if (sortField === 'completedTasks') {
      diff = a.completedCount - b.completedCount;
    }
    return sortAsc ? diff : -diff;
  });

  // Aggregate factual workload totals
  const totalActiveTasks = members.reduce((acc, m) => acc + m.activeTasksCount, 0);
  const totalOverdueTasks = members.reduce((acc, m) => acc + m.overdueCount, 0);
  const totalCompletedTasks = members.reduce((acc, m) => acc + m.completedCount, 0);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header with KPI cards */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-content flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-primary" />
            Team Workload & Operational Allocation
          </h3>
          <p className="text-xs text-content-muted">
            Factual operational workload distribution across active workforce.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData} className="text-xs">
          Refresh Workload
        </Button>
      </div>

      {/* Aggregate metric cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-surface p-3 rounded-lg border border-border">
          <div className="flex items-center justify-between text-xs text-content-muted mb-1">
            <span>Team Members</span>
            <Users className="h-4 w-4 text-primary" />
          </div>
          <div className="text-xl font-bold text-content">{members.length}</div>
        </div>

        <div className="bg-surface p-3 rounded-lg border border-border">
          <div className="flex items-center justify-between text-xs text-content-muted mb-1">
            <span>Active Tasks</span>
            <CheckSquare className="h-4 w-4 text-blue-500" />
          </div>
          <div className="text-xl font-bold text-content">{totalActiveTasks}</div>
        </div>

        <div className={`p-3 rounded-lg border ${totalOverdueTasks > 0 ? 'bg-status-danger/5 border-status-danger/30 text-status-danger' : 'bg-surface border-border'}`}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className={totalOverdueTasks > 0 ? 'text-status-danger' : 'text-content-muted'}>Overdue Tasks</span>
            <AlertCircle className={`h-4 w-4 ${totalOverdueTasks > 0 ? 'text-status-danger' : 'text-content-muted'}`} />
          </div>
          <div className="text-xl font-bold">{totalOverdueTasks}</div>
        </div>

        <div className="bg-surface p-3 rounded-lg border border-border">
          <div className="flex items-center justify-between text-xs text-content-muted mb-1">
            <span>Completed Tasks</span>
            <CheckSquare className="h-4 w-4 text-status-success" />
          </div>
          <div className="text-xl font-bold text-status-success">{totalCompletedTasks}</div>
        </div>
      </div>

      {/* Filter and search toolbar */}
      <div className="bg-surface p-3 rounded-lg border border-border flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-content-muted" />
          <input
            type="text"
            placeholder="Search by name, email, department..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-surface-muted border border-border rounded text-content placeholder:text-content-muted focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-content-muted" />
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as any)}
              className="bg-surface-muted border border-border rounded px-2 py-1 text-content text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="All">All Roles</option>
              <option value="Employee">Employees</option>
              <option value="Intern">Interns</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-surface-muted border border-border rounded px-2 py-1 text-content text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="All">All Attendance/Report Statuses</option>
              <option value="Present & Submitted">Present & Submitted</option>
              <option value="Present & Report Pending">Present & Report Pending</option>
              <option value="Absent / Not Checked In">Absent / Not Checked In</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table Content */}
      {loading ? (
        <LoadingState text="Loading team workload data..." />
      ) : error ? (
        <ErrorState title="Failed to load workload" message={error.message} onRetry={loadData} />
      ) : sorted.length === 0 ? (
        <div className="bg-surface p-8 text-center border border-border rounded-lg text-content-muted text-xs">
          No team members match the current filter criteria.
        </div>
      ) : (
        <div className="overflow-x-auto border border-border rounded-lg bg-surface">
          <table className="w-full text-left text-xs text-content">
            <thead className="bg-surface-muted border-b border-border text-content-muted">
              <tr>
                <th
                  onClick={() => toggleSort('name')}
                  className="px-3 py-2.5 font-medium cursor-pointer hover:text-content"
                >
                  <div className="flex items-center gap-1">
                    Team Member
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th className="px-3 py-2.5 font-medium">Today's Status</th>
                <th
                  onClick={() => toggleSort('activeTasks')}
                  className="px-3 py-2.5 font-medium text-center cursor-pointer hover:text-content"
                >
                  <div className="flex items-center justify-center gap-1">
                    Active Tasks
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th className="px-3 py-2.5 font-medium text-center">In Progress</th>
                <th
                  onClick={() => toggleSort('overdueTasks')}
                  className="px-3 py-2.5 font-medium text-center cursor-pointer hover:text-content"
                >
                  <div className="flex items-center justify-center gap-1">
                    Overdue
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th
                  onClick={() => toggleSort('completedTasks')}
                  className="px-3 py-2.5 font-medium text-center cursor-pointer hover:text-content"
                >
                  <div className="flex items-center justify-center gap-1">
                    Completed
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th className="px-3 py-2.5 font-medium text-center">Active Projects</th>
                <th className="px-3 py-2.5 font-medium">Alerts / Notes</th>
                <th className="px-3 py-2.5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sorted.map((m) => (
                <tr key={m.userId} className="hover:bg-surface-muted/50 transition-colors">
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      {m.avatarUrl ? (
                        <img
                          src={m.avatarUrl}
                          alt={m.fullName}
                          className="h-8 w-8 rounded-full object-cover border border-border shrink-0"
                        />
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                          {m.fullName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div className="font-semibold text-content">{m.fullName}</div>
                        <div className="text-[11px] text-content-muted">
                          {m.role} • {m.departmentName || 'General'}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="px-3 py-2.5">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-medium whitespace-nowrap ${
                        m.todayStatus === 'Present & Submitted'
                          ? 'bg-status-success/10 text-status-success'
                          : m.todayStatus === 'Present & Report Pending'
                          ? 'bg-status-warning/10 text-status-warning'
                          : 'bg-surface-muted text-content-muted'
                      }`}
                    >
                      {m.todayStatus}
                    </span>
                  </td>

                  <td className="px-3 py-2.5 text-center font-bold text-content">
                    {m.activeTasksCount}
                  </td>

                  <td className="px-3 py-2.5 text-center font-medium text-primary">
                    {m.inProgressCount}
                  </td>

                  <td className="px-3 py-2.5 text-center font-bold">
                    <span className={m.overdueCount > 0 ? 'text-status-danger' : 'text-content-muted'}>
                      {m.overdueCount}
                    </span>
                  </td>

                  <td className="px-3 py-2.5 text-center font-medium text-status-success">
                    {m.completedCount}
                  </td>

                  <td className="px-3 py-2.5 text-center text-content-muted">
                    {m.activeProjectsCount}
                  </td>

                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {m.hasReportedBlockerToday && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-status-danger/10 text-status-danger flex items-center gap-1">
                          <AlertCircle className="h-2.5 w-2.5" /> Blocker
                        </span>
                      )}
                      {m.hasPendingReportToday && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-status-warning/10 text-status-warning">
                          Report Pending
                        </span>
                      )}
                      {!m.hasReportedBlockerToday && !m.hasPendingReportToday && (
                        <span className="text-content-muted text-[11px]">—</span>
                      )}
                    </div>
                  </td>

                  <td className="px-3 py-2.5 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onSelectPerson(m.userId)}
                      className="text-xs py-1 px-2.5 h-auto inline-flex items-center gap-1"
                    >
                      <ExternalLink className="h-3 w-3 text-content-muted" />
                      Work Profile
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
