import React, { useEffect, useState } from 'react';
import { LoadingState } from '../ui/LoadingState';
import { ErrorState } from '../ui/ErrorState';
import { TrendingUp, CheckSquare, FileText, UserCheck } from 'lucide-react';
import { fetchWorkforceTrends } from '../../services/managementService';
import type { WorkActivityTrendPoint } from '../../types/management';

type TimeWindow = 7 | 14 | 30;

export const WorkActivityTrends: React.FC = () => {
  const [days, setDays] = useState<TimeWindow>(14);
  const [data, setData] = useState<WorkActivityTrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadTrends = async (windowDays: TimeWindow) => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchWorkforceTrends(windowDays);
      setData(res);
    } catch (err: any) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTrends(days);
  }, [days]);

  // Max value for scaling visual indicator
  const maxVal = Math.max(
    1,
    ...data.map((d) => Math.max(d.reportsSubmitted, d.tasksCompleted, d.attendanceCheckins))
  );

  const totalReports = data.reduce((sum, d) => sum + d.reportsSubmitted, 0);
  const totalTasksCompleted = data.reduce((sum, d) => sum + d.tasksCompleted, 0);
  const totalAttendance = data.reduce((sum, d) => sum + d.attendanceCheckins, 0);

  return (
    <div className="bg-surface p-4 rounded-lg border border-border space-y-4">
      {/* Header & Window Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
        <div>
          <h4 className="text-sm font-bold text-content flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Work Activity & Operational Throughput Trends
          </h4>
          <p className="text-xs text-content-muted">
            Factual daily timeline metrics for reports submitted, tasks completed, and attendance check-ins.
          </p>
        </div>

        <div className="flex items-center gap-1 bg-surface-muted p-0.5 rounded border border-border self-start sm:self-auto">
          <button
            onClick={() => setDays(7)}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
              days === 7 ? 'bg-surface text-primary shadow-xs font-semibold' : 'text-content-muted hover:text-content'
            }`}
          >
            Last 7 Days
          </button>
          <button
            onClick={() => setDays(14)}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
              days === 14 ? 'bg-surface text-primary shadow-xs font-semibold' : 'text-content-muted hover:text-content'
            }`}
          >
            Last 14 Days
          </button>
          <button
            onClick={() => setDays(30)}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
              days === 30 ? 'bg-surface text-primary shadow-xs font-semibold' : 'text-content-muted hover:text-content'
            }`}
          >
            Last 30 Days
          </button>
        </div>
      </div>

      {/* Aggregate Totals in Window */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-2.5 bg-surface-muted rounded border border-border flex items-center gap-3">
          <div className="p-2 rounded bg-primary/10 text-primary">
            <FileText className="h-4 w-4" />
          </div>
          <div>
            <p className="text-[11px] text-content-muted">Reports Submitted ({days}d)</p>
            <p className="text-base font-bold text-content">{totalReports}</p>
          </div>
        </div>

        <div className="p-2.5 bg-surface-muted rounded border border-border flex items-center gap-3">
          <div className="p-2 rounded bg-status-success/10 text-status-success">
            <CheckSquare className="h-4 w-4" />
          </div>
          <div>
            <p className="text-[11px] text-content-muted">Tasks Completed ({days}d)</p>
            <p className="text-base font-bold text-content">{totalTasksCompleted}</p>
          </div>
        </div>

        <div className="p-2.5 bg-surface-muted rounded border border-border flex items-center gap-3">
          <div className="p-2 rounded bg-blue-500/10 text-blue-500">
            <UserCheck className="h-4 w-4" />
          </div>
          <div>
            <p className="text-[11px] text-content-muted">Attendance Check-ins ({days}d)</p>
            <p className="text-base font-bold text-content">{totalAttendance}</p>
          </div>
        </div>
      </div>

      {/* Daily Activity Timeline Table / Graph */}
      {loading ? (
        <LoadingState text="Loading trend timeline..." />
      ) : error ? (
        <ErrorState title="Failed to load trends" message={error.message} onRetry={() => loadTrends(days)} />
      ) : data.length === 0 ? (
        <p className="text-center text-xs text-content-muted py-6">No activity recorded for this period.</p>
      ) : (
        <div className="overflow-x-auto border border-border rounded">
          <table className="w-full text-left text-xs text-content">
            <thead className="bg-surface-muted border-b border-border text-content-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium text-center">Reports Submitted</th>
                <th className="px-3 py-2 font-medium text-center">Tasks Completed</th>
                <th className="px-3 py-2 font-medium text-center">Attendance Check-ins</th>
                <th className="px-3 py-2 font-medium">Relative Activity Proportion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-surface">
              {data.map((pt) => {
                const repWidth = Math.round((pt.reportsSubmitted / maxVal) * 100);
                const taskWidth = Math.round((pt.tasksCompleted / maxVal) * 100);

                return (
                  <tr key={pt.date} className="hover:bg-surface-muted/50 transition-colors">
                    <td className="px-3 py-2 font-medium">{pt.date}</td>
                    <td className="px-3 py-2 text-center font-bold text-content">{pt.reportsSubmitted}</td>
                    <td className="px-3 py-2 text-center font-bold text-status-success">{pt.tasksCompleted}</td>
                    <td className="px-3 py-2 text-center font-bold text-blue-500">{pt.attendanceCheckins}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5 w-40">
                        <div className="w-full bg-surface-muted rounded-full h-2 overflow-hidden flex border border-border">
                          <div
                            className="bg-primary h-full transition-all"
                            style={{ width: `${repWidth}%` }}
                            title={`Reports: ${pt.reportsSubmitted}`}
                          />
                          <div
                            className="bg-status-success h-full transition-all"
                            style={{ width: `${taskWidth}%` }}
                            title={`Tasks Completed: ${pt.tasksCompleted}`}
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
