import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '../../components/ui/Card';
import { LoadingState } from '../../components/ui/LoadingState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import {
  FileText,
  ChevronLeft,
  ChevronRight,
  Eye,
  File,
  Download,
  Clock,
  CheckCircle2,
  AlertCircle,
  Filter,
  History,
  HelpCircle,
  RefreshCw,
  Search,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../features/auth/AuthContext';
import { useSearchParams } from 'react-router-dom';
import { fetchManagementReports } from '../../services/managementService';
import type { ManagementReportItem, ReportFilterParams } from '../../types/management';
import { BlockersAndRequirements } from '../../components/management/BlockersAndRequirements';
import { SyncHealthMonitor } from '../../components/management/SyncHealthMonitor';

export const ReportsPage: React.FC = () => {
  const { user, role } = useAuth();
  const [searchParams] = useSearchParams();
  const isAdmin = role === 'Admin' || role === 'Super Admin';

  // Navigation tab
  const [activeTab, setActiveTab] = useState<'reports' | 'history' | 'blockers' | 'sync'>('reports');

  // Reports data state
  const [reports, setReports] = useState<ManagementReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalCount, setTotalCount] = useState(0);

  // Filters
  const [preset, setPreset] = useState<'today' | 'this_week' | 'this_month' | 'custom' | ''>('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [syncStatusFilter, setSyncStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Report Detail Modal
  const [selectedReport, setSelectedReport] = useState<ManagementReportItem | null>(null);
  const [selectedReportEvidence, setSelectedReportEvidence] = useState<any[]>([]);

  // Load reports based on current filters
  const loadReports = async () => {
    if (!user) return;
    try {
      setLoading(true);
      setError(null);

      const params: ReportFilterParams = {
        preset: preset || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        status: statusFilter || undefined,
        role: roleFilter || undefined,
        syncStatus: syncStatusFilter || undefined,
        search: searchQuery || undefined,
        userId: !isAdmin ? user.id : undefined,
        page,
        pageSize,
      };

      const res = await fetchManagementReports(params);
      setReports(res.reports);
      setTotalCount(res.totalCount);
    } catch (err: any) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, [user, page, pageSize, preset, startDate, endDate, statusFilter, roleFilter, syncStatusFilter]);

  // Handle URL param reportId for deep linking
  useEffect(() => {
    const reportIdParam = searchParams.get('reportId');
    if (reportIdParam) {
      openReportById(reportIdParam);
    }
  }, [searchParams]);

  const openReportById = async (reportId: string) => {
    try {
      const { data, error: repErr } = await supabase
        .from('daily_reports')
        .select(`
          id,
          user_id,
          report_date,
          status,
          submitted_at,
          blockers,
          company_requirements,
          tomorrow_plan,
          notes,
          profiles!daily_reports_user_id_fkey (
            full_name,
            avatar_url,
            employment_status,
            departments!profiles_department_id_fkey ( name )
          ),
          daily_report_tasks (
            id,
            task_id,
            custom_task_title,
            time_spent_minutes,
            completion_percentage,
            task_status,
            tasks (
              title,
              projects ( name )
            )
          ),
          daily_report_sync (
            status,
            error_message
          )
        `)
        .eq('id', reportId)
        .single();

      if (repErr) throw repErr;

      const raw: any = data;
      const role = raw.profiles?.employment_status || 'Team Member';
      const tasks = (raw.daily_report_tasks || []).map((t: any) => ({
        id: t.id,
        taskId: t.task_id,
        taskTitle: t.tasks?.title || t.custom_task_title || 'General Task',
        projectName: t.tasks?.projects?.name,
        timeSpentMinutes: t.time_spent_minutes || 0,
        completionPercentage: t.completion_percentage || 0,
        taskStatus: t.task_status || 'In Progress',
      }));

      const formattedReport: ManagementReportItem = {
        id: raw.id,
        userId: raw.user_id,
        userName: raw.profiles?.full_name || 'Unknown',
        avatarUrl: raw.profiles?.avatar_url,
        role,
        departmentName: raw.profiles?.departments?.name || 'General',
        reportDate: raw.report_date,
        status: raw.status,
        submittedAt: raw.submitted_at,
        blockers: raw.blockers,
        companyRequirements: raw.company_requirements,
        tomorrowPlan: raw.tomorrow_plan,
        notes: raw.notes,
        taskCount: tasks.length,
        avgCompletionPercentage: tasks.length ? Math.round(tasks.reduce((s: number, t: any) => s + t.completionPercentage, 0) / tasks.length) : 0,
        totalTimeSpentMinutes: tasks.reduce((s: number, t: any) => s + t.timeSpentMinutes, 0),
        syncStatus: raw.daily_report_sync?.status || null,
        syncError: raw.daily_report_sync?.error_message || null,
        tasks,
      };

      openReport(formattedReport);
    } catch (err) {
      console.error('Failed to open report by id:', err);
    }
  };

  const openReport = async (report: ManagementReportItem) => {
    setSelectedReport(report);
    setSelectedReportEvidence([]);

    try {
      const { data: evidenceData } = await supabase
        .from('daily_report_attachments')
        .select('*')
        .eq('report_id', report.id);

      if (evidenceData) {
        setSelectedReportEvidence(evidenceData);
      }
    } catch (err) {
      console.error('Failed to load evidence for report:', err);
    }
  };

  // Secure download via 60-second temporary pre-signed URL
  const downloadEvidence = async (storagePath: string) => {
    try {
      const { data, error: signErr } = await supabase.storage
        .from('daily-evidence')
        .createSignedUrl(storagePath, 60);

      if (signErr) throw signErr;
      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank');
      }
    } catch (err: any) {
      console.error('Failed to generate signed download URL:', err);
      alert('Could not generate secure download link: ' + (err.message || 'Access denied'));
    }
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  const clearFilters = () => {
    setPreset('');
    setStartDate('');
    setEndDate('');
    setStatusFilter('');
    setRoleFilter('');
    setSyncStatusFilter('');
    setSearchQuery('');
    setPage(1);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-content flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            {isAdmin ? 'Management Daily Reports' : 'My Daily Reports'}
          </h1>
          <p className="text-xs text-content-muted mt-1">
            {isAdmin
              ? 'Authoritative daily work logs, task completions, reported friction, and sync status.'
              : 'Review your historical daily reports, work logs, and evidence uploads.'}
          </p>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-1.5 bg-surface border border-border rounded-lg p-1 text-xs self-start sm:self-auto">
            <button
              onClick={() => setActiveTab('reports')}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
                activeTab === 'reports' ? 'bg-primary text-white' : 'text-content hover:bg-surface-muted'
              }`}
            >
              <FileText className="h-3.5 w-3.5" /> Reports
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
                activeTab === 'history' ? 'bg-primary text-white' : 'text-content hover:bg-surface-muted'
              }`}
            >
              <History className="h-3.5 w-3.5" /> Work History
            </button>
            <button
              onClick={() => setActiveTab('blockers')}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
                activeTab === 'blockers' ? 'bg-primary text-white' : 'text-content hover:bg-surface-muted'
              }`}
            >
              <AlertCircle className="h-3.5 w-3.5" /> Blockers & Req
            </button>
            <button
              onClick={() => setActiveTab('sync')}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
                activeTab === 'sync' ? 'bg-primary text-white' : 'text-content hover:bg-surface-muted'
              }`}
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Sync Health
            </button>
          </div>
        )}
      </div>

      {/* Sub-view: Blockers & Requirements Tab */}
      {isAdmin && activeTab === 'blockers' && (
        <BlockersAndRequirements onSelectReport={openReportById} />
      )}

      {/* Sub-view: Google Sheets Sync Health Tab */}
      {isAdmin && activeTab === 'sync' && (
        <SyncHealthMonitor onSelectReport={openReportById} />
      )}

      {/* Sub-view: Daily Reports & Work History Views */}
      {(activeTab === 'reports' || activeTab === 'history' || !isAdmin) && (
        <>
          {/* Filters Bar */}
          <Card>
            <CardContent className="p-4 space-y-3">
              {/* Date Presets */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-semibold text-content-muted mr-1">Date:</span>
                <button
                  onClick={() => {
                    setPreset(preset === 'today' ? '' : 'today');
                    setPage(1);
                  }}
                  className={`px-2.5 py-1 rounded border text-xs font-medium transition-colors ${
                    preset === 'today' ? 'bg-primary text-white border-primary' : 'bg-surface border-border text-content hover:bg-surface-muted'
                  }`}
                >
                  Today
                </button>
                <button
                  onClick={() => {
                    setPreset(preset === 'this_week' ? '' : 'this_week');
                    setPage(1);
                  }}
                  className={`px-2.5 py-1 rounded border text-xs font-medium transition-colors ${
                    preset === 'this_week' ? 'bg-primary text-white border-primary' : 'bg-surface border-border text-content hover:bg-surface-muted'
                  }`}
                >
                  This Week
                </button>
                <button
                  onClick={() => {
                    setPreset(preset === 'this_month' ? '' : 'this_month');
                    setPage(1);
                  }}
                  className={`px-2.5 py-1 rounded border text-xs font-medium transition-colors ${
                    preset === 'this_month' ? 'bg-primary text-white border-primary' : 'bg-surface border-border text-content hover:bg-surface-muted'
                  }`}
                >
                  This Month
                </button>

                <div className="flex items-center gap-1.5 ml-2">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      setPreset('custom');
                      setPage(1);
                    }}
                    className="bg-surface border border-border rounded px-2 py-1 text-xs text-content"
                    placeholder="From"
                  />
                  <span className="text-content-muted">to</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => {
                      setEndDate(e.target.value);
                      setPreset('custom');
                      setPage(1);
                    }}
                    className="bg-surface border border-border rounded px-2 py-1 text-xs text-content"
                    placeholder="To"
                  />
                </div>
              </div>

              {/* Dimensional Filters */}
              <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border text-xs">
                <div className="flex items-center gap-1.5 bg-surface border border-border rounded px-2.5 py-1.5">
                  <Filter className="h-3.5 w-3.5 text-content-muted" />
                  <select
                    value={statusFilter}
                    onChange={(e) => {
                      setStatusFilter(e.target.value);
                      setPage(1);
                    }}
                    className="bg-transparent border-none outline-none text-content cursor-pointer"
                  >
                    <option value="">All Report Statuses</option>
                    <option value="submitted">Submitted</option>
                    <option value="draft">Draft</option>
                  </select>
                </div>

                {isAdmin && (
                  <div className="flex items-center gap-1.5 bg-surface border border-border rounded px-2.5 py-1.5">
                    <select
                      value={roleFilter}
                      onChange={(e) => {
                        setRoleFilter(e.target.value);
                        setPage(1);
                      }}
                      className="bg-transparent border-none outline-none text-content cursor-pointer"
                    >
                      <option value="">All Roles</option>
                      <option value="Employee">Employee</option>
                      <option value="Intern">Intern</option>
                    </select>
                  </div>
                )}

                {isAdmin && (
                  <div className="flex items-center gap-1.5 bg-surface border border-border rounded px-2.5 py-1.5">
                    <select
                      value={syncStatusFilter}
                      onChange={(e) => {
                        setSyncStatusFilter(e.target.value);
                        setPage(1);
                      }}
                      className="bg-transparent border-none outline-none text-content cursor-pointer"
                    >
                      <option value="">All Sync States</option>
                      <option value="synced">Google Synced</option>
                      <option value="pending">Sync Pending</option>
                      <option value="failed">Sync Failed</option>
                      <option value="permanently_failed">Permanently Failed</option>
                    </select>
                  </div>
                )}

                <div className="flex items-center gap-1.5 bg-surface border border-border rounded px-2.5 py-1.5 flex-1 min-w-[180px]">
                  <Search className="h-3.5 w-3.5 text-content-muted shrink-0" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setPage(1);
                    }}
                    placeholder="Search by name or content..."
                    className="bg-transparent border-none outline-none text-content w-full"
                  />
                </div>

                {(preset || startDate || endDate || statusFilter || roleFilter || syncStatusFilter || searchQuery) && (
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs h-auto py-1 text-content-muted">
                    Clear Filters
                  </Button>
                )}

                <Button variant="outline" size="sm" onClick={loadReports} className="text-xs gap-1 py-1 h-auto ml-auto">
                  <RefreshCw className="h-3.5 w-3.5" /> Refresh
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Table Container */}
          <Card>
            {loading && reports.length === 0 ? (
              <LoadingState text="Loading reports..." />
            ) : error ? (
              <ErrorState title="Failed to load reports" message={error.message} onRetry={loadReports} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm text-content">
                  <thead className="bg-surface-muted border-b border-border text-content-muted">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Report Date</th>
                      {isAdmin && <th className="px-4 py-3 font-semibold">Team Member</th>}
                      {isAdmin && <th className="px-4 py-3 font-semibold">Role</th>}
                      <th className="px-4 py-3 font-semibold">Tasks Logged</th>
                      <th className="px-4 py-3 font-semibold">Blockers</th>
                      <th className="px-4 py-3 font-semibold">Report Status</th>
                      {isAdmin && <th className="px-4 py-3 font-semibold">Google Sync</th>}
                      <th className="px-4 py-3 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border bg-surface">
                    {reports.length === 0 ? (
                      <tr>
                        <td colSpan={isAdmin ? 8 : 5} className="px-6 py-12 text-center text-content-muted">
                          <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          No reports match the current filter selection.
                        </td>
                      </tr>
                    ) : (
                      reports.map((report) => (
                        <tr key={report.id} className="hover:bg-surface-muted/50 transition-colors">
                          <td className="px-4 py-3 font-medium whitespace-nowrap">
                            {new Date(report.reportDate).toLocaleDateString(undefined, {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </td>

                          {isAdmin && (
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                {report.avatarUrl ? (
                                  <img src={report.avatarUrl} alt={report.userName} className="h-6 w-6 rounded-full object-cover border border-border" />
                                ) : (
                                  <span className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                                    {report.userName.charAt(0).toUpperCase()}
                                  </span>
                                )}
                                <span className="font-medium text-content">{report.userName}</span>
                              </div>
                            </td>
                          )}

                          {isAdmin && (
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className="px-2 py-0.5 rounded text-xs bg-surface-muted font-medium text-content">
                                {report.role}
                              </span>
                            </td>
                          )}

                          <td className="px-4 py-3">
                            {report.taskCount > 0 ? (
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-primary">{report.avgCompletionPercentage}%</span>
                                <span className="text-xs text-content-muted">
                                  ({report.taskCount} tasks, {report.totalTimeSpentMinutes}m)
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs text-content-muted italic">None logged</span>
                            )}
                          </td>

                          <td className="px-4 py-3">
                            {report.blockers ? (
                              <span className="inline-flex items-center gap-1 text-xs text-status-danger font-medium bg-status-danger/10 px-2 py-0.5 rounded">
                                <AlertCircle className="h-3 w-3" /> Reported
                              </span>
                            ) : (
                              <span className="text-xs text-content-muted">—</span>
                            )}
                          </td>

                          <td className="px-4 py-3 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                report.status === 'submitted'
                                  ? 'bg-status-success/10 text-status-success'
                                  : 'bg-status-warning/10 text-status-warning'
                              }`}
                            >
                              {report.status.toUpperCase()}
                            </span>
                          </td>

                          {isAdmin && (
                            <td className="px-4 py-3 whitespace-nowrap">
                              {report.syncStatus === 'synced' ? (
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-status-success">
                                  <CheckCircle2 className="h-3.5 w-3.5" /> Synced
                                </span>
                              ) : report.syncStatus === 'pending' ? (
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-status-warning">
                                  <Clock className="h-3.5 w-3.5" /> Queued
                                </span>
                              ) : report.syncStatus === 'failed' || report.syncStatus === 'permanently_failed' ? (
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-status-danger" title={report.syncError || ''}>
                                  <AlertCircle className="h-3.5 w-3.5" /> Failed
                                </span>
                              ) : (
                                <span className="text-xs text-content-muted">—</span>
                              )}
                            </td>
                          )}

                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <button
                              onClick={() => openReport(report)}
                              className="text-primary hover:text-primary-hover font-medium p-1.5 rounded hover:bg-primary/5 transition-colors"
                              title="Inspect Details"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Controls */}
            {totalCount > 0 && (
              <div className="px-4 py-3 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-3 text-content-muted">
                  <span>
                    Showing <strong className="text-content">{(page - 1) * pageSize + 1}</strong> to{' '}
                    <strong className="text-content">{Math.min(page * pageSize, totalCount)}</strong> of{' '}
                    <strong className="text-content">{totalCount}</strong> results
                  </span>

                  <div className="flex items-center gap-1.5">
                    <span>Rows:</span>
                    <select
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setPage(1);
                      }}
                      className="bg-surface border border-border rounded px-1.5 py-0.5 text-xs text-content"
                    >
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="h-7 w-7 p-0"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>

                  <span className="px-2 text-content font-medium">
                    Page {page} of {Math.max(1, totalPages)}
                  </span>

                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="h-7 w-7 p-0"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </>
      )}

      {/* Enhanced Report Detail Modal */}
      <Modal
        isOpen={!!selectedReport}
        onClose={() => setSelectedReport(null)}
        title="Daily Report Inspection"
      >
        {selectedReport && (
          <div className="space-y-6 max-h-[80vh] overflow-y-auto pr-1 text-xs sm:text-sm">
            {/* Report Header Metadata */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-surface-muted p-4 rounded-lg border border-border">
              <div>
                <p className="text-xs text-content-muted">Team Member</p>
                <p className="font-bold text-base text-content">{selectedReport.userName}</p>
                <p className="text-xs text-content-muted">{selectedReport.role} • {selectedReport.departmentName}</p>
              </div>

              <div className="sm:text-right">
                <p className="text-xs text-content-muted">Report Date</p>
                <p className="font-semibold text-content">{selectedReport.reportDate}</p>
                {selectedReport.submittedAt && (
                  <p className="text-xs text-content-muted">
                    Submitted: {new Date(selectedReport.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
              </div>
            </div>

            {/* Google Sheets Sync Health Notification in Modal */}
            {isAdmin && selectedReport.syncStatus && (
              <div
                className={`p-3 rounded-md border flex items-center justify-between text-xs ${
                  selectedReport.syncStatus === 'synced'
                    ? 'bg-status-success/5 border-status-success/20 text-status-success'
                    : selectedReport.syncStatus === 'pending'
                    ? 'bg-status-warning/5 border-status-warning/20 text-status-warning'
                    : 'bg-status-danger/5 border-status-danger/20 text-status-danger'
                }`}
              >
                <div className="flex items-center gap-2">
                  {selectedReport.syncStatus === 'synced' && <CheckCircle2 className="h-4 w-4" />}
                  {selectedReport.syncStatus === 'pending' && <Clock className="h-4 w-4" />}
                  {(selectedReport.syncStatus === 'failed' || selectedReport.syncStatus === 'permanently_failed') && (
                    <AlertCircle className="h-4 w-4" />
                  )}
                  <span>
                    Google Sheets Sync: <strong>{selectedReport.syncStatus.toUpperCase()}</strong>
                    {selectedReport.syncError && ` — ${selectedReport.syncError}`}
                  </span>
                </div>
              </div>
            )}

            {/* Tasks Worked On Section */}
            <div className="space-y-2">
              <h3 className="font-semibold text-content border-b border-border pb-1">
                Tasks Worked On ({selectedReport.tasks?.length || 0})
              </h3>
              {!selectedReport.tasks || selectedReport.tasks.length === 0 ? (
                <p className="text-content-muted italic py-1">No specific tasks logged for this day.</p>
              ) : (
                <div className="space-y-2">
                  {selectedReport.tasks.map((t) => (
                    <div key={t.id} className="p-3 bg-surface border border-border rounded-lg space-y-1">
                      <div className="flex items-center justify-between font-medium text-content">
                        <span>{t.taskTitle}</span>
                        <span className="text-primary font-bold">{t.completionPercentage}%</span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-content-muted">
                        <span>Time Spent: {t.timeSpentMinutes} mins</span>
                        <span>Project: {t.projectName || 'General'}</span>
                        <span className="capitalize">Status: {t.taskStatus.replace('_', ' ')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Narrative & Work Completed */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h3 className="font-semibold text-content border-b border-border pb-1 mb-1.5">Work Done / Notes</h3>
                <div className="bg-surface p-3 border border-border rounded whitespace-pre-wrap text-content">
                  {selectedReport.notes || 'None provided.'}
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-content border-b border-border pb-1 mb-1.5">Tomorrow's Plan</h3>
                <div className="bg-surface p-3 border border-border rounded whitespace-pre-wrap text-content">
                  {selectedReport.tomorrowPlan || 'None provided.'}
                </div>
              </div>
            </div>

            {/* Reported Blockers */}
            {selectedReport.blockers && (
              <div>
                <h3 className="font-semibold text-status-danger border-b border-border pb-1 mb-1.5 flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4" /> Reported Blocker
                </h3>
                <div className="p-3 bg-status-danger/5 border border-status-danger/20 rounded text-content whitespace-pre-wrap font-medium">
                  {selectedReport.blockers}
                </div>
              </div>
            )}

            {/* Company Requirements */}
            {selectedReport.companyRequirements && (
              <div>
                <h3 className="font-semibold text-primary border-b border-border pb-1 mb-1.5 flex items-center gap-1.5">
                  <HelpCircle className="h-4 w-4" /> Company Requirements
                </h3>
                <div className="p-3 bg-primary/5 border border-primary/20 rounded text-content whitespace-pre-wrap">
                  {selectedReport.companyRequirements}
                </div>
              </div>
            )}

            {/* Evidence & File Attachments (Secured via 60-second Pre-Signed URL) */}
            <div className="space-y-2">
              <h3 className="font-semibold text-content border-b border-border pb-1">
                Evidence Attachments ({selectedReportEvidence.length})
              </h3>
              {selectedReportEvidence.length === 0 ? (
                <p className="text-content-muted italic py-1">No evidence attached.</p>
              ) : (
                <div className="space-y-1.5">
                  {selectedReportEvidence.map((ev) => (
                    <div
                      key={ev.id}
                      className="flex items-center justify-between p-2.5 bg-surface border border-border rounded hover:bg-surface-muted transition-colors cursor-pointer"
                      onClick={() => downloadEvidence(ev.storage_path)}
                    >
                      <div className="flex items-center gap-2.5 overflow-hidden">
                        <File className="h-4 w-4 text-primary shrink-0" />
                        <div className="truncate">
                          <p className="font-medium text-content truncate">{ev.file_name}</p>
                          <p className="text-xs text-content-muted">{(ev.file_size / 1024).toFixed(1)} KB</p>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" className="text-xs gap-1 py-1 h-auto text-primary">
                        <Download className="h-3.5 w-3.5" /> Download
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
