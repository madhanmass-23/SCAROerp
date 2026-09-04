import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { LoadingState } from '../ui/LoadingState';
import { ErrorState } from '../ui/ErrorState';
import { Button } from '../ui/Button';
import { Users, Clock, CheckCircle, AlertTriangle, XCircle, Calendar } from 'lucide-react';
import { fetchAttendanceReportCorrelation } from '../../services/managementService';
import type { AttendanceReportCorrelationItem } from '../../types/management';

interface Props {
  onSelectPerson?: (userId: string) => void;
  onSelectReport?: (reportId: string) => void;
  initialDate?: string;
}

export const AttendanceReportCorrelation: React.FC<Props> = ({
  onSelectPerson,
  onSelectReport,
  initialDate,
}) => {
  const [date, setDate] = useState(initialDate || new Date().toISOString().split('T')[0]);
  const [data, setData] = useState<AttendanceReportCorrelationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'SUBMITTED' | 'PENDING' | 'ABSENT'>('ALL');

  const loadData = async (targetDate: string) => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchAttendanceReportCorrelation(targetDate);
      setData(res);
    } catch (err: any) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(date);
  }, [date]);

  const filteredData = data.filter((item) => {
    if (filter === 'SUBMITTED') return item.status === 'Present & Submitted';
    if (filter === 'PENDING') return item.status === 'Present & Report Pending';
    if (filter === 'ABSENT') return item.status === 'Absent / Not Checked In';
    return true;
  });

  const presentSubmittedCount = data.filter(d => d.status === 'Present & Submitted').length;
  const presentPendingCount = data.filter(d => d.status === 'Present & Report Pending').length;
  const absentCount = data.filter(d => d.status === 'Absent / Not Checked In').length;

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="h-5 w-5 text-primary" /> Today's Workforce & Report Correlation
          </CardTitle>
          <p className="text-xs text-content-muted mt-1">
            Correlating active employees and interns attendance with daily report submissions.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-surface-muted border border-border rounded-md px-3 py-1.5 text-xs">
            <Calendar className="h-4 w-4 text-content-muted" />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-transparent border-none outline-none text-content text-xs font-medium cursor-pointer"
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => loadData(date)}>
            Refresh
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-6 space-y-4">
        {/* Status Pills */}
        <div className="flex flex-wrap gap-2 text-xs">
          <button
            onClick={() => setFilter('ALL')}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
              filter === 'ALL'
                ? 'bg-content text-surface'
                : 'bg-surface-muted text-content-muted hover:text-content'
            }`}
          >
            All Workforce ({data.length})
          </button>
          <button
            onClick={() => setFilter('SUBMITTED')}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
              filter === 'SUBMITTED'
                ? 'bg-status-success text-white'
                : 'bg-status-success/10 text-status-success hover:bg-status-success/20'
            }`}
          >
            <CheckCircle className="h-3.5 w-3.5" /> Present & Submitted ({presentSubmittedCount})
          </button>
          <button
            onClick={() => setFilter('PENDING')}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
              filter === 'PENDING'
                ? 'bg-status-warning text-white'
                : 'bg-status-warning/10 text-status-warning hover:bg-status-warning/20'
            }`}
          >
            <AlertTriangle className="h-3.5 w-3.5" /> Present & Report Pending ({presentPendingCount})
          </button>
          <button
            onClick={() => setFilter('ABSENT')}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
              filter === 'ABSENT'
                ? 'bg-content-muted text-white'
                : 'bg-surface-muted text-content-muted hover:text-content'
            }`}
          >
            <XCircle className="h-3.5 w-3.5" /> Absent / Not Checked In ({absentCount})
          </button>
        </div>

        {loading ? (
          <LoadingState text="Loading correlation data..." />
        ) : error ? (
          <ErrorState title="Failed to load correlation data" message={error.message} onRetry={() => loadData(date)} />
        ) : filteredData.length === 0 ? (
          <div className="text-center py-10 text-content-muted text-sm border border-dashed border-border rounded-lg">
            No team members match the selected filter for {date}.
          </div>
        ) : (
          <div className="overflow-x-auto border border-border rounded-lg">
            <table className="w-full text-left text-xs sm:text-sm text-content">
              <thead className="bg-surface-muted border-b border-border text-content-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold">Team Member</th>
                  <th className="px-4 py-3 font-semibold">Role & Dept</th>
                  <th className="px-4 py-3 font-semibold">Attendance</th>
                  <th className="px-4 py-3 font-semibold">Report Status</th>
                  <th className="px-4 py-3 font-semibold">Correlation</th>
                  <th className="px-4 py-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-surface">
                {filteredData.map((row) => (
                  <tr key={row.userId} className="hover:bg-surface-muted/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        {row.avatarUrl ? (
                          <img
                            src={row.avatarUrl}
                            alt={row.fullName}
                            className="h-7 w-7 rounded-full object-cover border border-border"
                          />
                        ) : (
                          <span className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                            {row.fullName.charAt(0).toUpperCase()}
                          </span>
                        )}
                        <div className="truncate">
                          <p className="font-medium text-content truncate">{row.fullName}</p>
                          <p className="text-xs text-content-muted truncate">{row.email}</p>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="inline-block px-2 py-0.5 rounded text-xs bg-surface-muted text-content font-medium mr-1.5">
                        {row.role}
                      </span>
                      <span className="text-xs text-content-muted">{row.departmentName}</span>
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap">
                      {row.clockInTime ? (
                        <div className="flex items-center gap-1.5 text-xs text-content">
                          <Clock className="h-3.5 w-3.5 text-status-success shrink-0" />
                          <span>
                            {new Date(row.clockInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {row.clockOutTime && (
                            <span className="text-content-muted">
                              → {new Date(row.clockOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-content-muted">No check-in</span>
                      )}
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap">
                      {row.reportStatus === 'submitted' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-status-success/10 text-status-success">
                          Submitted
                        </span>
                      ) : row.reportStatus === 'draft' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-status-warning/10 text-status-warning">
                          Draft in progress
                        </span>
                      ) : (
                        <span className="text-xs text-content-muted italic">Not started</span>
                      )}
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap">
                      {row.status === 'Present & Submitted' ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-status-success">
                          <CheckCircle className="h-3.5 w-3.5" /> Present & Submitted
                        </span>
                      ) : row.status === 'Present & Report Pending' ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-status-warning">
                          <AlertTriangle className="h-3.5 w-3.5" /> Report Pending
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-content-muted">
                          <XCircle className="h-3.5 w-3.5" /> Absent
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        {row.reportId && onSelectReport && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onSelectReport(row.reportId!)}
                            className="text-xs text-primary hover:text-primary-hover py-1 px-2 h-auto"
                          >
                            View Report
                          </Button>
                        )}
                        {onSelectPerson && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onSelectPerson(row.userId)}
                            className="text-xs py-1 px-2 h-auto"
                          >
                            Profile
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
