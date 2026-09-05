import React, { useEffect, useState } from 'react';
import { LoadingState } from '../ui/LoadingState';
import { ErrorState } from '../ui/ErrorState';
import { TrendingUp, FileText, UserCheck, Calendar, Clock } from 'lucide-react';
import { fetchWorkforceTrends } from '../../services/managementService';
import type { WorkforceTrendsResult } from '../../types/management';

type TimeWindow = 7 | 14 | 30 | 'custom';

export const WorkActivityTrends: React.FC = () => {
  const [windowMode, setWindowMode] = useState<TimeWindow>(14);

  // Custom date range state
  const getLocalDate = (d: Date = new Date()) => {
    const offset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - offset).toISOString().split('T')[0];
  };

  const todayStr = getLocalDate(new Date());
  const defaultStartStr = getLocalDate(new Date(Date.now() - 13 * 86400000));

  const [customStart, setCustomStart] = useState<string>(defaultStartStr);
  const [customEnd, setCustomEnd] = useState<string>(todayStr);

  const [trends, setTrends] = useState<WorkforceTrendsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadTrends = async () => {
    try {
      setLoading(true);
      setError(null);
      let res: WorkforceTrendsResult;
      if (windowMode === 'custom') {
        res = await fetchWorkforceTrends({ startDate: customStart, endDate: customEnd });
      } else {
        res = await fetchWorkforceTrends(windowMode);
      }
      setTrends(res);
    } catch (err: any) {
      setError(err instanceof Error ? err : new Error(err.message || 'Failed to load trends'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTrends();
  }, [windowMode, customStart, customEnd]);

  const taskDist = trends?.taskDistribution || { completed: 0, inProgress: 0, pending: 0, total: 0 };
  const totalTasks = taskDist.total;
  const completedTasks = taskDist.completed;
  const inProgressTasks = taskDist.inProgress;
  const pendingTasks = taskDist.pending;

  const totalReports = trends?.totalReports || 0;
  const totalAttendance = trends?.totalAttendance || 0;
  const totalCompletedInRange = trends?.totalTasksCompleted || 0;
  const timeline = trends?.timeline || [];

  const hasAnyActivity = totalReports > 0 || totalAttendance > 0 || totalCompletedInRange > 0 || totalTasks > 0;

  // Donut chart math
  const radius = 38;
  const circumference = 2 * Math.PI * radius; // ~238.76

  const completedPct = totalTasks > 0 ? completedTasks / totalTasks : 0;
  const inProgressPct = totalTasks > 0 ? inProgressTasks / totalTasks : 0;
  const pendingPct = totalTasks > 0 ? pendingTasks / totalTasks : 0;

  const completedStroke = completedPct * circumference;
  const inProgressStroke = inProgressPct * circumference;
  const pendingStroke = pendingPct * circumference;

  const completedOffset = 0;
  const inProgressOffset = -completedStroke;
  const pendingOffset = -(completedStroke + inProgressStroke);

  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return (
    <div className="bg-surface p-4 sm:p-5 rounded-lg border border-border space-y-5">
      {/* Header & Window Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
        <div>
          <h4 className="text-sm sm:text-base font-bold text-content flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Work Activity & Operational Throughput
          </h4>
          <p className="text-xs text-content-muted mt-0.5">
            Operational activity distribution, task completion metrics, and daily compliance timeline.
          </p>
        </div>

        {/* Preset Tabs & Custom Option */}
        <div className="flex flex-wrap items-center gap-1 bg-surface-muted p-0.5 rounded-md border border-border self-start sm:self-auto">
          <button
            id="trends-btn-7d"
            data-testid="trends-btn-7d"
            onClick={() => setWindowMode(7)}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
              windowMode === 7 ? 'bg-surface text-primary shadow-xs font-semibold' : 'text-content-muted hover:text-content'
            }`}
          >
            Last 7 Days
          </button>
          <button
            id="trends-btn-14d"
            data-testid="trends-btn-14d"
            onClick={() => setWindowMode(14)}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
              windowMode === 14 ? 'bg-surface text-primary shadow-xs font-semibold' : 'text-content-muted hover:text-content'
            }`}
          >
            Last 14 Days
          </button>
          <button
            id="trends-btn-30d"
            data-testid="trends-btn-30d"
            onClick={() => setWindowMode(30)}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
              windowMode === 30 ? 'bg-surface text-primary shadow-xs font-semibold' : 'text-content-muted hover:text-content'
            }`}
          >
            Last 30 Days
          </button>
          <button
            id="trends-btn-custom"
            data-testid="trends-btn-custom"
            onClick={() => setWindowMode('custom')}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
              windowMode === 'custom' ? 'bg-surface text-primary shadow-xs font-semibold' : 'text-content-muted hover:text-content'
            }`}
          >
            Custom Date
          </button>
        </div>
      </div>

      {/* Custom Date Pickers (Shown when Custom Date is selected) */}
      {windowMode === 'custom' && (
        <div className="flex flex-wrap items-center gap-3 p-3 bg-surface-muted/70 rounded-lg border border-border text-xs">
          <div className="flex items-center gap-1.5 font-medium text-content">
            <Calendar className="h-3.5 w-3.5 text-primary" />
            <span>Date Range:</span>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="trends-custom-start" className="text-content-muted font-medium">From:</label>
            <input
              id="trends-custom-start"
              data-testid="trends-custom-start"
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="px-2.5 py-1 bg-surface border border-border rounded text-content text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="trends-custom-end" className="text-content-muted font-medium">To:</label>
            <input
              id="trends-custom-end"
              data-testid="trends-custom-end"
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="px-2.5 py-1 bg-surface border border-border rounded text-content text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>
      )}

      {loading ? (
        <LoadingState text="Loading operational analytics..." />
      ) : error ? (
        <ErrorState title="Failed to load analytics" message={error.message} onRetry={loadTrends} />
      ) : !hasAnyActivity ? (
        <div className="py-10 text-center space-y-2">
          <p className="text-sm font-semibold text-content">No activity recorded for this period.</p>
          <p className="text-xs text-content-muted">Adjust the date filter or create tasks and attendance check-ins to view activity trends.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left Column: Donut Visual & Operational KPIs (5 cols) */}
          <div className="lg:col-span-5 bg-surface-muted/40 p-4 rounded-lg border border-border space-y-4">
            <h5 className="text-xs font-bold text-content uppercase tracking-wider">
              Task Status Distribution
            </h5>

            {/* Donut Chart and Legend */}
            <div className="flex flex-col sm:flex-row items-center gap-4 justify-around">
              {/* Circular Donut SVG */}
              <div className="relative w-32 h-32 shrink-0 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                  {/* Background Track */}
                  <circle
                    cx="50"
                    cy="50"
                    r={radius}
                    className="stroke-border"
                    strokeWidth="10"
                    fill="transparent"
                  />

                  {totalTasks > 0 ? (
                    <>
                      {/* Completed Slice (Green) */}
                      {completedTasks > 0 && (
                        <circle
                          cx="50"
                          cy="50"
                          r={radius}
                          stroke="#10B981"
                          strokeWidth="10"
                          strokeDasharray={`${completedStroke} ${circumference - completedStroke}`}
                          strokeDashoffset={completedOffset}
                          fill="transparent"
                          strokeLinecap="round"
                        />
                      )}
                      {/* In Progress Slice (Blue/Indigo) */}
                      {inProgressTasks > 0 && (
                        <circle
                          cx="50"
                          cy="50"
                          r={radius}
                          stroke="#6366F1"
                          strokeWidth="10"
                          strokeDasharray={`${inProgressStroke} ${circumference - inProgressStroke}`}
                          strokeDashoffset={inProgressOffset}
                          fill="transparent"
                        />
                      )}
                      {/* Pending/Todo Slice (Amber) */}
                      {pendingTasks > 0 && (
                        <circle
                          cx="50"
                          cy="50"
                          r={radius}
                          stroke="#F59E0B"
                          strokeWidth="10"
                          strokeDasharray={`${pendingStroke} ${circumference - pendingStroke}`}
                          strokeDashoffset={pendingOffset}
                          fill="transparent"
                        />
                      )}
                    </>
                  ) : (
                    <circle
                      cx="50"
                      cy="50"
                      r={radius}
                      className="stroke-border/60"
                      strokeWidth="10"
                      fill="transparent"
                    />
                  )}
                </svg>

                {/* Center Badge */}
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                  <span className="text-xl font-extrabold text-content leading-none">
                    {totalTasks > 0 ? `${completionRate}%` : '0%'}
                  </span>
                  <span className="text-[10px] text-content-muted font-medium mt-0.5">
                    Tasks Done
                  </span>
                </div>
              </div>

              {/* Task Breakdown Counts */}
              <div className="space-y-2 text-xs w-full sm:w-auto">
                <div className="flex items-center justify-between sm:justify-start gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-status-success shrink-0" />
                    <span className="text-content font-medium">Completed</span>
                  </div>
                  <span className="font-bold text-content">{completedTasks}</span>
                </div>

                <div className="flex items-center justify-between sm:justify-start gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-primary shrink-0" />
                    <span className="text-content font-medium">In Progress</span>
                  </div>
                  <span className="font-bold text-content">{inProgressTasks}</span>
                </div>

                <div className="flex items-center justify-between sm:justify-start gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-500 shrink-0" />
                    <span className="text-content font-medium">Pending</span>
                  </div>
                  <span className="font-bold text-content">{pendingTasks}</span>
                </div>
              </div>
            </div>

            {/* Compact Summary KPIs for Reports & Attendance */}
            <div className="pt-3 border-t border-border grid grid-cols-2 gap-2.5 text-xs">
              <div className="p-2.5 bg-surface rounded border border-border flex items-center gap-2.5">
                <div className="p-1.5 rounded bg-primary/10 text-primary shrink-0">
                  <FileText className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-content-muted truncate">Reports Submitted</p>
                  <p className="text-sm font-bold text-content">{totalReports}</p>
                </div>
              </div>

              <div className="p-2.5 bg-surface rounded border border-border flex items-center gap-2.5">
                <div className="p-1.5 rounded bg-blue-500/10 text-blue-500 shrink-0">
                  <UserCheck className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-content-muted truncate">Check-ins</p>
                  <p className="text-sm font-bold text-content">{totalAttendance}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Daily Activity Timeline (7 cols) */}
          <div className="lg:col-span-7 space-y-2.5">
            <div className="flex items-center justify-between">
              <h5 className="text-xs font-bold text-content uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-content-muted" /> Daily Activity Trend ({timeline.length} days)
              </h5>
              <span className="text-[11px] text-content-muted font-medium">
                {totalCompletedInRange} tasks completed in period
              </span>
            </div>

            <div className="overflow-x-auto border border-border rounded-lg max-h-[290px] overflow-y-auto">
              <table className="w-full text-left text-xs text-content">
                <thead className="bg-surface-muted border-b border-border text-content-muted sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Date</th>
                    <th className="px-3 py-2 font-semibold text-center">Reports</th>
                    <th className="px-3 py-2 font-semibold text-center">Tasks Done</th>
                    <th className="px-3 py-2 font-semibold text-center">Check-ins</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-surface">
                  {timeline.map((pt) => {
                    const hasDayActivity = pt.reportsSubmitted > 0 || pt.tasksCompleted > 0 || pt.attendanceCheckins > 0;
                    return (
                      <tr 
                        key={pt.date} 
                        className={`transition-colors ${
                          hasDayActivity ? 'bg-surface-muted/30 font-medium' : 'hover:bg-surface-muted/20 text-content-muted'
                        }`}
                      >
                        <td className="px-3 py-1.5 font-medium text-content">{pt.date}</td>
                        <td className="px-3 py-1.5 text-center font-bold text-primary">
                          {pt.reportsSubmitted}
                        </td>
                        <td className="px-3 py-1.5 text-center font-bold text-status-success">
                          {pt.tasksCompleted}
                        </td>
                        <td className="px-3 py-1.5 text-center font-bold text-blue-500">
                          {pt.attendanceCheckins}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

