import React, { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { LoadingState } from '../ui/LoadingState';
import { ErrorState } from '../ui/ErrorState';
import { Button } from '../ui/Button';
import {
  Calendar,
  AlertCircle,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import { fetchPersonWorkIntelligence } from '../../services/managementService';
import type { PersonWorkIntelligence } from '../../types/management';

interface Props {
  userId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSelectReport?: (reportId: string) => void;
}

type TabType = 'tasks' | 'projects' | 'history' | 'attendance_leave' | 'meetings' | 'blockers';

export const PersonWorkProfileModal: React.FC<Props> = ({
  userId,
  isOpen,
  onClose,
  onSelectReport,
}) => {
  const [data, setData] = useState<PersonWorkIntelligence | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('tasks');

  const loadProfile = async (id: string) => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchPersonWorkIntelligence(id);
      setData(res);
    } catch (err: any) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && userId) {
      loadProfile(userId);
      setActiveTab('tasks');
    } else {
      setData(null);
    }
  }, [isOpen, userId]);

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Team Member Work Profile" className="max-w-4xl">
      {loading ? (
        <LoadingState text="Loading comprehensive work profile..." />
      ) : error ? (
        <ErrorState title="Failed to load profile" message={error.message} onRetry={() => userId && loadProfile(userId)} />
      ) : !data ? null : (
        <div className="space-y-5 text-xs sm:text-sm">
          {/* Header Identity Card */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface-muted p-4 rounded-lg border border-border">
            <div className="flex items-center gap-3.5">
              {data.profile.avatarUrl ? (
                <img
                  src={data.profile.avatarUrl}
                  alt={data.profile.fullName}
                  className="h-14 w-14 rounded-full object-cover border border-border shrink-0"
                />
              ) : (
                <div className="h-14 w-14 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xl shrink-0">
                  {data.profile.fullName?.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="space-y-0.5 truncate">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-content truncate">{data.profile.fullName}</h3>
                  <span className="px-2 py-0.5 rounded text-xs bg-primary/10 text-primary font-medium">
                    {data.profile.role}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${
                      data.profile.isActive
                        ? 'bg-status-success/10 text-status-success'
                        : 'bg-status-danger/10 text-status-danger'
                    }`}
                  >
                    {data.profile.isActive ? 'Active' : 'Disabled'}
                  </span>
                </div>
                <p className="text-content-muted text-xs">{data.profile.email}</p>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-content-muted pt-1">
                  <span><strong>Department:</strong> {data.profile.departmentName}</span>
                  {data.profile.designation && <span>• <strong>Designation:</strong> {data.profile.designation}</span>}
                  {data.profile.joiningDate && <span>• <strong>Joined:</strong> {data.profile.joiningDate}</span>}
                </div>
              </div>
            </div>
          </div>

          {/* Operational Workload Metrics Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
            <div className="p-2.5 bg-surface border border-border rounded text-center">
              <p className="text-[11px] text-content-muted">Active Tasks</p>
              <p className="text-base font-bold text-content">{data.workload.activeTasks}</p>
            </div>
            <div className="p-2.5 bg-surface border border-border rounded text-center">
              <p className="text-[11px] text-content-muted">In Progress</p>
              <p className="text-base font-bold text-primary">{data.workload.inProgressTasks}</p>
            </div>
            <div className="p-2.5 bg-surface border border-border rounded text-center">
              <p className="text-[11px] text-content-muted">In Review</p>
              <p className="text-base font-bold text-blue-500">{data.workload.reviewTasks}</p>
            </div>
            <div className="p-2.5 bg-surface border border-border rounded text-center">
              <p className="text-[11px] text-content-muted">Needs Revision</p>
              <p className="text-base font-bold text-amber-500">{data.workload.needsRevisionTasks}</p>
            </div>
            <div className="p-2.5 bg-surface border border-border rounded text-center">
              <p className="text-[11px] text-content-muted">On Hold</p>
              <p className="text-base font-bold text-content-muted">{data.workload.onHoldTasks}</p>
            </div>
            <div className={`p-2.5 border rounded text-center ${data.workload.overdueTasks > 0 ? 'bg-status-danger/5 border-status-danger/30 text-status-danger' : 'bg-surface border-border'}`}>
              <p className="text-[11px] text-content-muted">Overdue</p>
              <p className="text-base font-bold">{data.workload.overdueTasks}</p>
            </div>
            <div className="p-2.5 bg-surface border border-border rounded text-center">
              <p className="text-[11px] text-content-muted">Completed</p>
              <p className="text-base font-bold text-status-success">{data.workload.completedTasks}</p>
            </div>
            <div className="p-2.5 bg-surface border border-border rounded text-center">
              <p className="text-[11px] text-content-muted">Projects</p>
              <p className="text-base font-bold text-content">{data.workload.activeProjects}</p>
            </div>
          </div>

          {/* Operational Alerts */}
          {data.alerts.length > 0 && (
            <div className="space-y-1.5">
              {data.alerts.map((alt) => (
                <div
                  key={alt.id}
                  className={`p-2.5 rounded border text-xs flex items-center justify-between gap-2 ${
                    alt.severity === 'danger'
                      ? 'bg-status-danger/10 border-status-danger/30 text-status-danger'
                      : 'bg-status-warning/10 border-status-warning/30 text-status-warning'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span><strong>{alt.title}:</strong> {alt.description}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Tab Navigation */}
          <div className="flex border-b border-border gap-2 overflow-x-auto text-xs">
            <button
              onClick={() => setActiveTab('tasks')}
              className={`pb-2 px-2 font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'tasks' ? 'border-primary text-primary' : 'border-transparent text-content-muted hover:text-content'
              }`}
            >
              Active Tasks ({data.activeTasks.length})
            </button>
            <button
              onClick={() => setActiveTab('projects')}
              className={`pb-2 px-2 font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'projects' ? 'border-primary text-primary' : 'border-transparent text-content-muted hover:text-content'
              }`}
            >
              Projects ({data.projects.length})
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`pb-2 px-2 font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'history' ? 'border-primary text-primary' : 'border-transparent text-content-muted hover:text-content'
              }`}
            >
              Work History ({data.workHistory.length})
            </button>
            <button
              onClick={() => setActiveTab('attendance_leave')}
              className={`pb-2 px-2 font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'attendance_leave' ? 'border-primary text-primary' : 'border-transparent text-content-muted hover:text-content'
              }`}
            >
              Attendance & Leave ({data.attendanceSessions.length + data.leaves.length})
            </button>
            <button
              onClick={() => setActiveTab('meetings')}
              className={`pb-2 px-2 font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'meetings' ? 'border-primary text-primary' : 'border-transparent text-content-muted hover:text-content'
              }`}
            >
              Meetings ({data.meetings.length})
            </button>
            <button
              onClick={() => setActiveTab('blockers')}
              className={`pb-2 px-2 font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'blockers' ? 'border-primary text-primary' : 'border-transparent text-content-muted hover:text-content'
              }`}
            >
              Blockers ({data.reportedBlockers.length})
            </button>
          </div>

          {/* Tab 1: Active Tasks */}
          {activeTab === 'tasks' && (
            <div className="space-y-2">
              {data.activeTasks.length === 0 ? (
                <p className="text-content-muted italic py-4 text-center">No active tasks currently assigned.</p>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {data.activeTasks.map((t) => (
                    <div key={t.id} className="p-3 bg-surface border border-border rounded flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-content">{t.title}</span>
                          <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                            t.priority === 'Urgent' ? 'bg-status-danger/10 text-status-danger' :
                            t.priority === 'High' ? 'bg-status-warning/10 text-status-warning' :
                            'bg-surface-muted text-content-muted'
                          }`}>
                            {t.priority}
                          </span>
                          {t.isOverdue && (
                            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-status-danger/10 text-status-danger flex items-center gap-1">
                              <AlertCircle className="h-3 w-3" /> Overdue
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-content-muted">
                          Project: <strong>{t.projectName}</strong> • Due: {t.dueDate || 'No deadline'} • Est: {t.estimatedHours}h
                        </p>
                      </div>
                      <div className="flex items-center gap-3 sm:self-auto self-end">
                        <div className="w-24 bg-surface-muted rounded-full h-2 overflow-hidden border border-border">
                          <div className="bg-primary h-full rounded-full" style={{ width: `${t.progress}%` }} />
                        </div>
                        <span className="text-xs font-semibold text-primary w-8 text-right">{t.progress}%</span>
                        <span className="px-2 py-0.5 rounded text-xs bg-surface-muted text-content font-medium capitalize">
                          {t.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Project Contributions */}
          {activeTab === 'projects' && (
            <div className="space-y-2">
              {data.projects.length === 0 ? (
                <p className="text-content-muted italic py-4 text-center">No project contributions found.</p>
              ) : (
                <div className="overflow-x-auto border border-border rounded">
                  <table className="w-full text-left text-xs text-content">
                    <thead className="bg-surface-muted border-b border-border text-content-muted">
                      <tr>
                        <th className="px-3 py-2 font-medium">Project Name</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                        <th className="px-3 py-2 font-medium">Enrollment</th>
                        <th className="px-3 py-2 font-medium text-center">Assigned</th>
                        <th className="px-3 py-2 font-medium text-center">Open</th>
                        <th className="px-3 py-2 font-medium text-center">Overdue</th>
                        <th className="px-3 py-2 font-medium text-center">Completed</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border bg-surface">
                      {data.projects.map((p) => (
                        <tr key={p.projectId}>
                          <td className="px-3 py-2 font-medium">{p.projectName}</td>
                          <td className="px-3 py-2">
                            <span className="px-2 py-0.5 rounded text-[11px] bg-primary/10 text-primary font-medium">
                              {p.projectStatus}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-content-muted">
                            {p.isEnrolledMember ? (
                              <span className="px-2 py-0.5 rounded text-[11px] bg-status-success/10 text-status-success font-medium">
                                Enrolled Member
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[11px] bg-surface-muted text-content-muted">
                                Task Assignee
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center font-medium">{p.assignedTasksCount}</td>
                          <td className="px-3 py-2 text-center text-primary font-medium">{p.openTasksCount}</td>
                          <td className="px-3 py-2 text-center font-medium">
                            <span className={p.overdueTasksCount > 0 ? 'text-status-danger font-bold' : 'text-content-muted'}>
                              {p.overdueTasksCount}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-center text-status-success font-medium">{p.completedTasksCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Tab 3: Work History */}
          {activeTab === 'history' && (
            <div className="space-y-2">
              {data.workHistory.length === 0 ? (
                <p className="text-content-muted italic py-4 text-center">No work history entries found.</p>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {data.workHistory.map((h) => (
                    <div key={h.id} className="p-3 bg-surface border border-border rounded space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-content">{h.reportDate}</span>
                          {h.projectName && (
                            <span className="px-2 py-0.5 rounded text-[11px] bg-primary/10 text-primary font-medium">
                              {h.projectName}
                            </span>
                          )}
                          <span className="text-content-muted text-xs">• {h.taskTitle}</span>
                        </div>
                        {onSelectReport && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              onClose();
                              onSelectReport(h.reportId);
                            }}
                            className="text-xs text-primary py-0.5 px-2 h-auto"
                          >
                            Inspect Report
                          </Button>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-content-muted">
                        <span><strong>Time Spent:</strong> {h.timeSpentMinutes} mins ({Math.round((h.timeSpentMinutes / 60) * 10) / 10} hrs)</span>
                        <span>• <strong>Progress:</strong> {h.completionPercentage}%</span>
                        {h.taskStatus && <span>• <strong>Status:</strong> {h.taskStatus}</span>}
                      </div>
                      {h.tomorrowPlan && (
                        <p className="text-xs text-content-muted bg-surface-muted p-1.5 rounded">
                          <strong>Tomorrow:</strong> {h.tomorrowPlan}
                        </p>
                      )}
                      {h.blockers && (
                        <div className="p-2 bg-status-danger/5 border border-status-danger/20 rounded text-xs text-status-danger flex items-start gap-1.5">
                          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                          <span><strong>Blocker:</strong> {h.blockers}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab 4: Attendance & Leave */}
          {activeTab === 'attendance_leave' && (
            <div className="space-y-4">
              {/* Leaves Section */}
              <div className="space-y-1.5">
                <h5 className="font-semibold text-content text-xs flex items-center gap-1.5">
                  <Calendar className="h-4 w-4 text-primary" /> Leave Records ({data.leaves.length})
                </h5>
                {data.leaves.length === 0 ? (
                  <p className="text-content-muted italic py-1 text-xs">No leave requests on record.</p>
                ) : (
                  <div className="overflow-x-auto border border-border rounded">
                    <table className="w-full text-left text-xs text-content">
                      <thead className="bg-surface-muted border-b border-border text-content-muted">
                        <tr>
                          <th className="px-3 py-2 font-medium">Leave Type</th>
                          <th className="px-3 py-2 font-medium">Start Date</th>
                          <th className="px-3 py-2 font-medium">End Date</th>
                          <th className="px-3 py-2 font-medium text-center">Duration</th>
                          <th className="px-3 py-2 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border bg-surface">
                        {data.leaves.map((l) => (
                          <tr key={l.id}>
                            <td className="px-3 py-2 font-medium">{l.type}</td>
                            <td className="px-3 py-2">{l.startDate}</td>
                            <td className="px-3 py-2">{l.endDate}</td>
                            <td className="px-3 py-2 text-center">{l.daysCount} day{l.daysCount > 1 ? 's' : ''}</td>
                            <td className="px-3 py-2">
                              <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                                l.status === 'Approved' ? 'bg-status-success/10 text-status-success' :
                                l.status === 'Pending' ? 'bg-status-warning/10 text-status-warning' :
                                'bg-status-danger/10 text-status-danger'
                              }`}>
                                {l.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Attendance Sessions Section */}
              <div className="space-y-1.5">
                <h5 className="font-semibold text-content text-xs flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-primary" /> Recent Attendance Sessions (Last 30 Days)
                </h5>
                {data.attendanceSessions.length === 0 ? (
                  <p className="text-content-muted italic py-1 text-xs">No attendance sessions recorded.</p>
                ) : (
                  <div className="overflow-x-auto border border-border rounded max-h-56 overflow-y-auto">
                    <table className="w-full text-left text-xs text-content">
                      <thead className="bg-surface-muted border-b border-border text-content-muted sticky top-0">
                        <tr>
                          <th className="px-3 py-2 font-medium">Session Date</th>
                          <th className="px-3 py-2 font-medium">Clock In</th>
                          <th className="px-3 py-2 font-medium">Clock Out</th>
                          <th className="px-3 py-2 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border bg-surface">
                        {data.attendanceSessions.map((s: any) => (
                          <tr key={s.id}>
                            <td className="px-3 py-2 font-medium">{s.session_date}</td>
                            <td className="px-3 py-2 text-content-muted">
                              {s.clock_in_time ? new Date(s.clock_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                            </td>
                            <td className="px-3 py-2 text-content-muted">
                              {s.clock_out_time ? new Date(s.clock_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Active/Open'}
                            </td>
                            <td className="px-3 py-2">
                              <span className="px-2 py-0.5 rounded text-[11px] bg-status-success/10 text-status-success font-medium">
                                {s.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab 5: Meetings */}
          {activeTab === 'meetings' && (
            <div className="space-y-2">
              {data.meetings.length === 0 ? (
                <p className="text-content-muted italic py-4 text-center">No collaborative meetings scheduled.</p>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {data.meetings.map((m) => (
                    <div key={m.id} className="p-3 bg-surface border border-border rounded flex items-center justify-between">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-content">{m.title}</span>
                          {m.meetingType && (
                            <span className="px-2 py-0.5 rounded text-[11px] bg-primary/10 text-primary font-medium">
                              {m.meetingType}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-content-muted">
                          Date: <strong>{m.meetingDate}</strong> • Time: {m.startTime} – {m.endTime}
                        </p>
                      </div>
                      <span className="px-2 py-0.5 rounded text-xs bg-surface-muted text-content font-medium capitalize">
                        {m.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab 6: Reported Blockers */}
          {activeTab === 'blockers' && (
            <div className="space-y-2">
              {data.reportedBlockers.length === 0 ? (
                <p className="text-content-muted italic py-4 text-center">No reported blockers on record.</p>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {data.reportedBlockers.map((b, idx) => (
                    <div key={idx} className="p-3 bg-status-danger/5 border border-status-danger/20 rounded space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-status-danger text-xs">Report Date: {b.reportDate}</span>
                        {onSelectReport && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              onClose();
                              onSelectReport(b.reportId);
                            }}
                            className="text-xs text-primary py-0.5 px-2 h-auto"
                          >
                            Inspect Report
                          </Button>
                        )}
                      </div>
                      <p className="text-xs text-content">{b.blockerText}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};

