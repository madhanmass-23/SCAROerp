import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { LoadingState } from '../ui/LoadingState';
import { ErrorState } from '../ui/ErrorState';
import { Button } from '../ui/Button';
import { CheckCircle2, AlertCircle, Clock, XCircle, RefreshCw } from 'lucide-react';
import { fetchSyncHealth } from '../../services/managementService';
import type { SyncHealthSummary } from '../../types/management';

interface Props {
  onSelectReport?: (reportId: string) => void;
}

export const SyncHealthMonitor: React.FC<Props> = ({ onSelectReport }) => {
  const [data, setData] = useState<SyncHealthSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchSyncHealth();
      setData(res);
    } catch (err: any) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (loading) return <LoadingState text="Loading sync health metrics..." />;
  if (error) return <ErrorState title="Failed to load sync health" message={error.message} onRetry={loadData} />;
  if (!data) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-border">
        <div>
          <CardTitle className="text-lg flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-status-success inline-block"></span>
            Google Sheets Synchronization Health
          </CardTitle>
          <p className="text-xs text-content-muted mt-1">
            Authoritative sync state tracking from PostgreSQL (Phase 5A pg_net pipeline).
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData} className="gap-1.5 text-xs">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </CardHeader>

      <CardContent className="p-4 sm:p-6 space-y-6">
        {/* Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 bg-status-success/5 border border-status-success/20 rounded-lg">
            <div className="flex items-center gap-2 text-status-success mb-1">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase">Synced</span>
            </div>
            <p className="text-2xl font-bold text-content">{data.synced}</p>
            <p className="text-xs text-content-muted mt-0.5">Written to Google Sheet</p>
          </div>

          <div className="p-4 bg-status-warning/5 border border-status-warning/20 rounded-lg">
            <div className="flex items-center gap-2 text-status-warning mb-1">
              <Clock className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase">Pending</span>
            </div>
            <p className="text-2xl font-bold text-content">{data.pending}</p>
            <p className="text-xs text-content-muted mt-0.5">Queued / In processing</p>
          </div>

          <div className="p-4 bg-status-danger/5 border border-status-danger/20 rounded-lg">
            <div className="flex items-center gap-2 text-status-danger mb-1">
              <AlertCircle className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase">Failed (Retrying)</span>
            </div>
            <p className="text-2xl font-bold text-content">{data.failed}</p>
            <p className="text-xs text-content-muted mt-0.5">Under 5 retry attempts</p>
          </div>

          <div className="p-4 bg-surface-muted border border-border rounded-lg">
            <div className="flex items-center gap-2 text-content-muted mb-1">
              <XCircle className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase">Permanently Failed</span>
            </div>
            <p className="text-2xl font-bold text-content">{data.permanentlyFailed}</p>
            <p className="text-xs text-content-muted mt-0.5">Exceeded max attempts</p>
          </div>
        </div>

        {/* Failed Sync Records Table */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-content uppercase tracking-wider">
            Failed Synchronization Incidents ({data.failedRecords.length})
          </h4>

          {data.failedRecords.length === 0 ? (
            <div className="p-4 text-center text-xs text-content-muted bg-surface-muted/50 border border-dashed border-border rounded-lg">
              All submitted daily reports are operating normally with zero synchronization failures.
            </div>
          ) : (
            <div className="overflow-x-auto border border-border rounded-lg">
              <table className="w-full text-left text-xs text-content">
                <thead className="bg-surface-muted border-b border-border text-content-muted">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Report Date</th>
                    <th className="px-4 py-2.5 font-medium">Team Member</th>
                    <th className="px-4 py-2.5 font-medium">Attempts</th>
                    <th className="px-4 py-2.5 font-medium">Last Attempt</th>
                    <th className="px-4 py-2.5 font-medium">Sanitized Error</th>
                    <th className="px-4 py-2.5 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-surface">
                  {data.failedRecords.map((rec) => (
                    <tr key={rec.reportId} className="hover:bg-surface-muted/50">
                      <td className="px-4 py-2.5 whitespace-nowrap font-medium">{rec.reportDate}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">{rec.userName}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className="px-2 py-0.5 bg-status-danger/10 text-status-danger rounded text-xs font-medium">
                          {rec.attemptCount} / 5
                        </span>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-content-muted">
                        {rec.lastAttemptAt ? new Date(rec.lastAttemptAt).toLocaleString() : 'Pending retry'}
                      </td>
                      <td className="px-4 py-2.5 max-w-xs truncate text-status-danger">
                        {rec.errorMessage || 'Network/Service timeout'}
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        {onSelectReport && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onSelectReport(rec.reportId)}
                            className="text-xs text-primary py-1 px-2 h-auto"
                          >
                            Inspect
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
