import React, { useEffect, useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Textarea } from '../../components/ui/Textarea';
import { Select } from '../../components/ui/Select';
import { LoadingState } from '../../components/ui/LoadingState';
import { ErrorState } from '../../components/ui/ErrorState';
import { EmptyState } from '../../components/ui/EmptyState';
import { useAuth } from '../../features/auth/AuthContext';
import {
  Calendar as CalendarIcon,
  Plus,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Users,
  Search,
  RefreshCw,
  Ban,
  CalendarCheck,
} from 'lucide-react';
import type {
  LeaveRequest,
  LeaveType,
  LeaveStatus,
  LeaveFilterParams,
} from '../../types/leave';
import {
  fetchOwnLeaveRequests,
  fetchManagementLeaveRequests,
  submitLeaveRequest,
  cancelLeaveRequest,
  approveLeaveRequest,
  rejectLeaveRequest,
  checkLeaveOverlap,
  fetchTodayOnLeaveUsers,
  fetchUpcomingApprovedLeaves,
} from '../../services/leaveService';

export const LeavePage: React.FC = () => {
  const { user, role } = useAuth();
  const isManager = role === 'Super Admin' || role === 'Admin';

  // Active view tab for managers
  const [activeTab, setActiveTab] = useState<'my_leave' | 'pending' | 'today' | 'schedule' | 'all'>(
    isManager ? 'pending' : 'my_leave'
  );

  // Data states
  const [myRequests, setMyRequests] = useState<LeaveRequest[]>([]);
  const [managementRequests, setManagementRequests] = useState<LeaveRequest[]>([]);
  const [todayOnLeave, setTodayOnLeave] = useState<
    { id: string; user_id: string; full_name: string; type: LeaveType; start_date: string; end_date: string }[]
  >([]);
  const [upcomingLeaves, setUpcomingLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters for All Records view
  const [filters, setFilters] = useState<LeaveFilterParams>({
    status: 'All',
    type: 'All',
    searchQuery: '',
    startDate: '',
    endDate: '',
  });

  // Modals
  const [isApplyModalOpen, setIsApplyModalOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [selectedRequestForReject, setSelectedRequestForReject] = useState<LeaveRequest | null>(null);
  const [rejectionReasonInput, setRejectionReasonInput] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Application form state
  const [applyType, setApplyType] = useState<LeaveType>('Leave');
  const [applyStartDate, setApplyStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [applyEndDate, setApplyEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [applyReason, setApplyReason] = useState('');
  const [overlapWarning, setOverlapWarning] = useState<string | null>(null);

  // Load Data
  const loadData = async () => {
    if (!user) return;
    try {
      setLoading(true);
      setError(null);

      const promises: Promise<any>[] = [fetchOwnLeaveRequests(user.id)];

      if (isManager) {
        promises.push(fetchManagementLeaveRequests(filters));
        promises.push(fetchTodayOnLeaveUsers());
        promises.push(fetchUpcomingApprovedLeaves(30));
      }

      const results = await Promise.all(promises);
      setMyRequests(results[0]);

      if (isManager) {
        setManagementRequests(results[1]);
        setTodayOnLeave(results[2]);
        setUpcomingLeaves(results[3]);
      }
    } catch (err: any) {
      console.error('Failed to load leave data:', err);
      setError(err.message || 'Failed to load leave records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, role, filters.status, filters.type, filters.startDate, filters.endDate]);

  // Check overlap when dates change in modal
  useEffect(() => {
    if (!user || !isApplyModalOpen || !applyStartDate || !applyEndDate) return;
    if (applyEndDate < applyStartDate) {
      setOverlapWarning('End date cannot be before start date.');
      return;
    }

    const verifyOverlap = async () => {
      try {
        const check = await checkLeaveOverlap(user.id, applyStartDate, applyEndDate);
        if (check.hasOverlap) {
          const conflicting = check.overlappingRequests[0];
          setOverlapWarning(
            `Warning: You already have a ${conflicting.status} ${conflicting.type} request from ${conflicting.start_date} to ${conflicting.end_date}.`
          );
        } else {
          setOverlapWarning(null);
        }
      } catch (err) {
        console.error('Overlap check failed:', err);
      }
    };

    verifyOverlap();
  }, [user, isApplyModalOpen, applyStartDate, applyEndDate]);

  // Handlers
  const handleApplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (applyEndDate < applyStartDate) {
      setActionError('End date must be greater than or equal to start date.');
      return;
    }
    if (!applyReason.trim()) {
      setActionError('Please provide a reason for your request.');
      return;
    }

    try {
      setActionLoading(true);
      setActionError(null);
      await submitLeaveRequest({
        user_id: user.id,
        type: applyType,
        start_date: applyStartDate,
        end_date: applyEndDate,
        reason: applyReason.trim(),
      });

      setIsApplyModalOpen(false);
      setApplyReason('');
      setOverlapWarning(null);
      await loadData();
    } catch (err: any) {
      console.error('Application submit error:', err);
      setActionError(err.message || 'Failed to submit leave application');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async (requestId: string) => {
    if (!confirm('Are you sure you want to cancel this leave request?')) return;
    try {
      setActionLoading(true);
      await cancelLeaveRequest(requestId);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to cancel request');
    } finally {
      setActionLoading(false);
    }
  };

  const handleApprove = async (requestId: string) => {
    try {
      setActionLoading(true);
      await approveLeaveRequest(requestId);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to approve request');
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenRejectModal = (req: LeaveRequest) => {
    setSelectedRequestForReject(req);
    setRejectionReasonInput('');
    setActionError(null);
    setIsRejectModalOpen(true);
  };

  const handleRejectSubmit = async () => {
    if (!selectedRequestForReject) return;
    if (!rejectionReasonInput.trim()) {
      setActionError('A rejection reason is required.');
      return;
    }

    try {
      setActionLoading(true);
      setActionError(null);
      await rejectLeaveRequest(selectedRequestForReject.id, rejectionReasonInput.trim());
      setIsRejectModalOpen(false);
      setSelectedRequestForReject(null);
      await loadData();
    } catch (err: any) {
      setActionError(err.message || 'Failed to reject request');
    } finally {
      setActionLoading(false);
    }
  };

  // Helper functions
  const calculateDays = (start: string, end: string) => {
    const s = new Date(start).getTime();
    const e = new Date(end).getTime();
    const diff = Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;
    return diff > 0 ? diff : 1;
  };

  const renderStatusBadge = (status: LeaveStatus) => {
    switch (status) {
      case 'Pending':
        return <Badge variant="warning">Pending Review</Badge>;
      case 'Approved':
        return <Badge variant="success">Approved</Badge>;
      case 'Rejected':
        return <Badge variant="danger">Rejected</Badge>;
      case 'Cancelled':
        return <Badge variant="default">Cancelled</Badge>;
      default:
        return <Badge variant="default">{status}</Badge>;
    }
  };

  // Compute My Leave Metrics
  const myPendingCount = myRequests.filter(r => r.status === 'Pending').length;
  const myApprovedDays = myRequests
    .filter(r => r.status === 'Approved')
    .reduce((acc, r) => acc + calculateDays(r.start_date, r.end_date), 0);
  const myTotalRequests = myRequests.length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-content flex items-center gap-2.5">
            <CalendarIcon className="h-6 w-6 text-primary" /> Leave & HR Operations
          </h1>
          <p className="text-xs text-content-muted mt-1">
            Manage time off, permissions, and work-from-home requests with real-time workforce tracking.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={loading}
            className="gap-1.5 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setActionError(null);
              setIsApplyModalOpen(true);
            }}
            className="gap-1.5 text-xs font-semibold"
          >
            <Plus className="h-4 w-4" /> Apply for Leave
          </Button>
        </div>
      </div>

      {/* Role Navigation Tabs for Managers */}
      {isManager && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs border-b border-border">
          <button
            onClick={() => setActiveTab('pending')}
            className={`px-3.5 py-2 rounded-lg font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              activeTab === 'pending'
                ? 'bg-primary text-white font-semibold shadow-sm'
                : 'text-content-muted hover:bg-surface-muted hover:text-content'
            }`}
          >
            <Clock className="h-4 w-4" />
            Pending Action
            {managementRequests.filter(r => r.status === 'Pending').length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-white text-primary font-bold">
                {managementRequests.filter(r => r.status === 'Pending').length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('today')}
            className={`px-3.5 py-2 rounded-lg font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              activeTab === 'today'
                ? 'bg-primary text-white font-semibold shadow-sm'
                : 'text-content-muted hover:bg-surface-muted hover:text-content'
            }`}
          >
            <Users className="h-4 w-4" />
            Today's On Leave ({todayOnLeave.length})
          </button>

          <button
            onClick={() => setActiveTab('schedule')}
            className={`px-3.5 py-2 rounded-lg font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              activeTab === 'schedule'
                ? 'bg-primary text-white font-semibold shadow-sm'
                : 'text-content-muted hover:bg-surface-muted hover:text-content'
            }`}
          >
            <CalendarCheck className="h-4 w-4" />
            Leave Schedule
          </button>

          <button
            onClick={() => setActiveTab('all')}
            className={`px-3.5 py-2 rounded-lg font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              activeTab === 'all'
                ? 'bg-primary text-white font-semibold shadow-sm'
                : 'text-content-muted hover:bg-surface-muted hover:text-content'
            }`}
          >
            All Company Records
          </button>

          <button
            onClick={() => setActiveTab('my_leave')}
            className={`px-3.5 py-2 rounded-lg font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              activeTab === 'my_leave'
                ? 'bg-primary text-white font-semibold shadow-sm'
                : 'text-content-muted hover:bg-surface-muted hover:text-content'
            }`}
          >
            My Own Requests
          </button>
        </div>
      )}

      {/* Main Content Area */}
      {loading && myRequests.length === 0 ? (
        <LoadingState text="Loading leave operations..." />
      ) : error ? (
        <ErrorState title="Failed to load leave records" message={error} onRetry={loadData} />
      ) : (
        <>
          {/* TAB 1: MY LEAVE (Standard view for Employee & Intern, accessible by Admin) */}
          {(activeTab === 'my_leave' || !isManager) && (
            <div className="space-y-6">
              {/* Summary Metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="p-4 border border-border">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-content-muted uppercase tracking-wider">
                        Pending Requests
                      </p>
                      <p className="text-2xl font-bold text-amber-600 mt-1">{myPendingCount}</p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-amber-50 text-amber-600">
                      <Clock className="h-5 w-5" />
                    </div>
                  </div>
                  <p className="text-[11px] text-content-muted mt-2">Awaiting managerial review</p>
                </Card>

                <Card className="p-4 border border-border">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-content-muted uppercase tracking-wider">
                        Approved Days (YTD)
                      </p>
                      <p className="text-2xl font-bold text-emerald-600 mt-1">{myApprovedDays}</p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-600">
                      <CheckCircle2 className="h-5 w-5" />
                    </div>
                  </div>
                  <p className="text-[11px] text-content-muted mt-2">Total approved time off taken</p>
                </Card>

                <Card className="p-4 border border-border">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-content-muted uppercase tracking-wider">
                        Total Requests
                      </p>
                      <p className="text-2xl font-bold text-content mt-1">{myTotalRequests}</p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-surface-muted text-content">
                      <CalendarIcon className="h-5 w-5" />
                    </div>
                  </div>
                  <p className="text-[11px] text-content-muted mt-2">Lifetime submitted applications</p>
                </Card>
              </div>

              {/* My Requests List */}
              <Card className="overflow-hidden border border-border">
                <div className="px-5 py-3.5 border-b border-border bg-surface-muted/30 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-content">My Leave Applications</h2>
                  <span className="text-xs text-content-muted">{myRequests.length} records</span>
                </div>

                {myRequests.length === 0 ? (
                  <EmptyState
                    title="No leave requests yet"
                    description="You have not submitted any leave applications. Click 'Apply for Leave' to get started."
                    icon={<CalendarIcon className="h-10 w-10 text-content-muted/50" />}
                  />
                ) : (
                  <div className="divide-y divide-border">
                    {myRequests.map(req => {
                      const days = calculateDays(req.start_date, req.end_date);
                      return (
                        <div
                          key={req.id}
                          className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-surface-muted/30 transition-colors"
                        >
                          <div className="space-y-1.5 flex-1 min-w-0">
                            <div className="flex items-center gap-2.5 flex-wrap">
                              <span className="text-sm font-semibold text-content">{req.type}</span>
                              {renderStatusBadge(req.status)}
                              <span className="text-xs text-content-muted font-medium">
                                {req.start_date} → {req.end_date} ({days} {days === 1 ? 'day' : 'days'})
                              </span>
                            </div>
                            <p className="text-xs text-content-muted line-clamp-2">{req.reason}</p>

                            {req.status === 'Rejected' && req.rejection_reason && (
                              <div className="mt-1.5 p-2 rounded bg-rose-50 border border-rose-100 text-xs text-rose-700 flex items-start gap-1.5">
                                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                <span>
                                  <strong>Reason for Rejection:</strong> {req.rejection_reason}
                                </span>
                              </div>
                            )}

                            <p className="text-[10px] text-content-muted/70">
                              Applied on {new Date(req.created_at).toLocaleDateString()}
                              {req.reviewed_at && ` • Reviewed on ${new Date(req.reviewed_at).toLocaleDateString()}`}
                            </p>
                          </div>

                          {/* Cancellation for Pending requests */}
                          {req.status === 'Pending' && (
                            <div className="shrink-0 self-start sm:self-center">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleCancel(req.id)}
                                disabled={actionLoading}
                                className="text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200 gap-1"
                              >
                                <Ban className="h-3.5 w-3.5" /> Cancel Request
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            </div>
          )}

          {/* TAB 2: PENDING REVIEW (MANAGERS) */}
          {isManager && activeTab === 'pending' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-content">Pending Leave Approvals</h2>
                  <p className="text-xs text-content-muted">
                    Review and decide on active employee and intern leave requests.
                  </p>
                </div>
              </div>

              {managementRequests.filter(r => r.status === 'Pending').length === 0 ? (
                <Card className="p-12 text-center border border-border">
                  <CheckCircle2 className="h-12 w-12 mx-auto text-emerald-500/40 mb-3" />
                  <p className="text-base font-semibold text-content">All caught up!</p>
                  <p className="text-xs text-content-muted mt-1">
                    There are no pending leave requests requiring managerial action.
                  </p>
                </Card>
              ) : (
                <Card className="overflow-hidden border border-border">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-surface-muted/50 text-content-muted uppercase tracking-wider border-b border-border text-[11px]">
                        <tr>
                          <th className="py-3 px-4 font-semibold">Applicant</th>
                          <th className="py-3 px-4 font-semibold">Department</th>
                          <th className="py-3 px-4 font-semibold">Type</th>
                          <th className="py-3 px-4 font-semibold">Dates</th>
                          <th className="py-3 px-4 font-semibold">Days</th>
                          <th className="py-3 px-4 font-semibold">Reason</th>
                          <th className="py-3 px-4 font-semibold text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {managementRequests
                          .filter(r => r.status === 'Pending')
                          .map(req => {
                            const days = calculateDays(req.start_date, req.end_date);
                            return (
                              <tr key={req.id} className="hover:bg-surface-muted/30 transition-colors">
                                <td className="py-3.5 px-4 font-semibold text-content">
                                  {req.applicant?.full_name || 'Team Member'}
                                  <span className="block text-[10px] text-content-muted font-normal">
                                    {req.applicant?.employment_status || 'Staff'}
                                  </span>
                                </td>
                                <td className="py-3.5 px-4 text-content-muted">
                                  {req.applicant?.department_name || 'General'}
                                </td>
                                <td className="py-3.5 px-4">
                                  <span className="font-medium text-content">{req.type}</span>
                                </td>
                                <td className="py-3.5 px-4 font-mono text-content-muted">
                                  {req.start_date} → {req.end_date}
                                </td>
                                <td className="py-3.5 px-4 font-semibold text-content">{days}</td>
                                <td className="py-3.5 px-4 text-content-muted max-w-xs truncate" title={req.reason}>
                                  {req.reason}
                                </td>
                                <td className="py-3.5 px-4 text-right space-x-2">
                                  <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={() => handleApprove(req.id)}
                                    disabled={actionLoading}
                                    className="text-xs bg-emerald-600 hover:bg-emerald-700 h-8 px-2.5 font-semibold"
                                  >
                                    Approve
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleOpenRejectModal(req)}
                                    disabled={actionLoading}
                                    className="text-xs text-rose-600 hover:bg-rose-50 border-rose-200 h-8 px-2.5"
                                  >
                                    Reject
                                  </Button>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </div>
          )}

          {/* TAB 3: TODAY'S ON LEAVE (MANAGERS) */}
          {isManager && activeTab === 'today' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-bold text-content">Today's On-Leave Workforce</h2>
                <p className="text-xs text-content-muted">
                  Employees and interns who have approved leave covering today's date.
                </p>
              </div>

              {todayOnLeave.length === 0 ? (
                <Card className="p-12 text-center border border-border">
                  <Users className="h-12 w-12 mx-auto text-content-muted/40 mb-3" />
                  <p className="text-base font-semibold text-content">No team members on leave today</p>
                  <p className="text-xs text-content-muted mt-1">
                    All scheduled employees and interns are expected for daily work.
                  </p>
                </Card>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {todayOnLeave.map(item => (
                    <Card key={item.id} className="p-4 border border-border space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-content">{item.full_name}</span>
                        <Badge variant="success">On Leave</Badge>
                      </div>
                      <p className="text-xs text-content-muted font-medium">{item.type}</p>
                      <p className="text-[11px] font-mono text-content-muted">
                        {item.start_date} → {item.end_date}
                      </p>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: LEAVE SCHEDULE / CALENDAR (READ-ONLY) */}
          {isManager && activeTab === 'schedule' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-bold text-content">Approved Leave Schedule (Next 30 Days)</h2>
                <p className="text-xs text-content-muted">
                  High-level company schedule. Personal notes and private reasons are omitted for privacy.
                </p>
              </div>

              {upcomingLeaves.length === 0 ? (
                <Card className="p-12 text-center border border-border">
                  <CalendarCheck className="h-12 w-12 mx-auto text-content-muted/40 mb-3" />
                  <p className="text-base font-semibold text-content">No upcoming leaves scheduled</p>
                  <p className="text-xs text-content-muted mt-1">
                    There are no approved future time-off records for the next 30 days.
                  </p>
                </Card>
              ) : (
                <Card className="overflow-hidden border border-border">
                  <div className="divide-y divide-border">
                    {upcomingLeaves.map(item => {
                      const days = calculateDays(item.start_date, item.end_date);
                      return (
                        <div key={item.id} className="p-4 flex items-center justify-between hover:bg-surface-muted/30">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-content">
                                {item.applicant?.full_name || 'Team Member'}
                              </span>
                              <Badge variant="primary">{item.type}</Badge>
                              {item.applicant?.department_name && (
                                <span className="text-xs text-content-muted">
                                  ({item.applicant.department_name})
                                </span>
                              )}
                            </div>
                            <p className="text-xs font-mono text-content-muted">
                              {item.start_date} → {item.end_date} ({days} {days === 1 ? 'day' : 'days'})
                            </p>
                          </div>
                          <Badge variant="success">Scheduled</Badge>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              )}
            </div>
          )}

          {/* TAB 5: ALL RECORDS (MANAGERS) */}
          {isManager && activeTab === 'all' && (
            <div className="space-y-4">
              {/* Filter Controls */}
              <Card className="p-4 border border-border space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-content-muted block mb-1">Status</label>
                    <Select
                      options={[
                        { label: 'All Statuses', value: 'All' },
                        { label: 'Pending', value: 'Pending' },
                        { label: 'Approved', value: 'Approved' },
                        { label: 'Rejected', value: 'Rejected' },
                        { label: 'Cancelled', value: 'Cancelled' },
                      ]}
                      value={filters.status}
                      onChange={e => setFilters(f => ({ ...f, status: e.target.value as any }))}
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-content-muted block mb-1">Type</label>
                    <Select
                      options={[
                        { label: 'All Types', value: 'All' },
                        { label: 'Leave', value: 'Leave' },
                        { label: 'Permission', value: 'Permission' },
                        { label: 'Work From Home', value: 'Work From Home' },
                      ]}
                      value={filters.type}
                      onChange={e => setFilters(f => ({ ...f, type: e.target.value as any }))}
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-content-muted block mb-1">Search</label>
                    <div className="relative">
                      <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-content-muted" />
                      <Input
                        type="text"
                        placeholder="Search employee or keyword..."
                        value={filters.searchQuery || ''}
                        onChange={e => setFilters(f => ({ ...f, searchQuery: e.target.value }))}
                        className="pl-8"
                      />
                    </div>
                  </div>
                </div>
              </Card>

              {/* All Records Table */}
              <Card className="overflow-hidden border border-border">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-surface-muted/50 text-content-muted uppercase tracking-wider border-b border-border text-[11px]">
                      <tr>
                        <th className="py-3 px-4 font-semibold">Applicant</th>
                        <th className="py-3 px-4 font-semibold">Department</th>
                        <th className="py-3 px-4 font-semibold">Type</th>
                        <th className="py-3 px-4 font-semibold">Dates</th>
                        <th className="py-3 px-4 font-semibold">Days</th>
                        <th className="py-3 px-4 font-semibold">Status</th>
                        <th className="py-3 px-4 font-semibold">Submitted</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {managementRequests.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="text-center py-8 text-content-muted">
                            No records matching filter criteria.
                          </td>
                        </tr>
                      ) : (
                        managementRequests.map(req => {
                          const days = calculateDays(req.start_date, req.end_date);
                          return (
                            <tr key={req.id} className="hover:bg-surface-muted/30 transition-colors">
                              <td className="py-3.5 px-4 font-semibold text-content">
                                {req.applicant?.full_name || 'Team Member'}
                              </td>
                              <td className="py-3.5 px-4 text-content-muted">
                                {req.applicant?.department_name || 'General'}
                              </td>
                              <td className="py-3.5 px-4 font-medium text-content">{req.type}</td>
                              <td className="py-3.5 px-4 font-mono text-content-muted">
                                {req.start_date} → {req.end_date}
                              </td>
                              <td className="py-3.5 px-4 font-semibold text-content">{days}</td>
                              <td className="py-3.5 px-4">{renderStatusBadge(req.status)}</td>
                              <td className="py-3.5 px-4 text-content-muted">
                                {new Date(req.created_at).toLocaleDateString()}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}
        </>
      )}

      {/* APPLY FOR LEAVE MODAL */}
      <Modal
        isOpen={isApplyModalOpen}
        onClose={() => {
          if (!actionLoading) setIsApplyModalOpen(false);
        }}
        title="Apply for Leave / Time Off"
      >
        <form onSubmit={handleApplySubmit} className="space-y-4 text-xs">
          {actionError && (
            <div className="p-3 rounded bg-rose-50 border border-rose-200 text-rose-700">
              {actionError}
            </div>
          )}

          {overlapWarning && (
            <div className="p-3 rounded bg-amber-50 border border-amber-200 text-amber-800 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
              <span>{overlapWarning}</span>
            </div>
          )}

          <div>
            <label className="font-semibold text-content block mb-1">Leave Type</label>
            <Select
              options={[
                { label: 'Leave', value: 'Leave' },
                { label: 'Permission', value: 'Permission' },
                { label: 'Work From Home', value: 'Work From Home' },
              ]}
              value={applyType}
              onChange={e => setApplyType(e.target.value as LeaveType)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-semibold text-content block mb-1">Start Date</label>
              <Input
                type="date"
                required
                value={applyStartDate}
                onChange={e => setApplyStartDate(e.target.value)}
              />
            </div>
            <div>
              <label className="font-semibold text-content block mb-1">End Date</label>
              <Input
                type="date"
                required
                value={applyEndDate}
                min={applyStartDate}
                onChange={e => setApplyEndDate(e.target.value)}
              />
            </div>
          </div>

          <div className="p-2.5 rounded bg-surface-muted text-content-muted flex items-center justify-between text-xs">
            <span>Duration:</span>
            <span className="font-bold text-content">
              {calculateDays(applyStartDate, applyEndDate)} Calendar Day(s)
            </span>
          </div>

          <div>
            <label className="font-semibold text-content block mb-1">Reason</label>
            <Textarea
              required
              rows={3}
              placeholder="State reason for your leave application..."
              value={applyReason}
              onChange={e => setApplyReason(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={actionLoading}
              onClick={() => setIsApplyModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={actionLoading}
              className="font-semibold"
            >
              {actionLoading ? 'Submitting...' : 'Submit Request'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* REJECT LEAVE MODAL (REASON REQUIRED) */}
      <Modal
        isOpen={isRejectModalOpen}
        onClose={() => {
          if (!actionLoading) setIsRejectModalOpen(false);
        }}
        title="Reject Leave Request"
      >
        <div className="space-y-4 text-xs">
          {actionError && (
            <div className="p-3 rounded bg-rose-50 border border-rose-200 text-rose-700">
              {actionError}
            </div>
          )}

          <p className="text-content-muted">
            You are rejecting the {selectedRequestForReject?.type} request submitted by{' '}
            <strong>{selectedRequestForReject?.applicant?.full_name || 'the employee'}</strong> for{' '}
            {selectedRequestForReject?.start_date} to {selectedRequestForReject?.end_date}.
          </p>

          <div>
            <label className="font-semibold text-content block mb-1">
              Reason for Rejection <span className="text-rose-600">*</span>
            </label>
            <Textarea
              required
              rows={3}
              placeholder="Please specify why this request cannot be approved..."
              value={rejectionReasonInput}
              onChange={e => setRejectionReasonInput(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={actionLoading}
              onClick={() => setIsRejectModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={actionLoading}
              onClick={handleRejectSubmit}
              className="bg-rose-600 hover:bg-rose-700 text-white font-semibold"
            >
              {actionLoading ? 'Rejecting...' : 'Confirm Rejection'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
