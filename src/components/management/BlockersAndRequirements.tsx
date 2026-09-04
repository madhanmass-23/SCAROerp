import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardContent } from '../ui/Card';
import { LoadingState } from '../ui/LoadingState';
import { ErrorState } from '../ui/ErrorState';
import { Button } from '../ui/Button';
import { AlertCircle, HelpCircle, Eye, RefreshCw } from 'lucide-react';
import { fetchReportedBlockers, fetchReportedRequirements } from '../../services/managementService';
import type { ReportedBlockerItem, ReportedRequirementItem } from '../../types/management';

interface Props {
  onSelectReport?: (reportId: string) => void;
  defaultTab?: 'blockers' | 'requirements';
}

export const BlockersAndRequirements: React.FC<Props> = ({
  onSelectReport,
  defaultTab = 'blockers',
}) => {
  const [activeTab, setActiveTab] = useState<'blockers' | 'requirements'>(defaultTab);
  const [blockers, setBlockers] = useState<ReportedBlockerItem[]>([]);
  const [requirements, setRequirements] = useState<ReportedRequirementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [blk, req] = await Promise.all([
        fetchReportedBlockers(20),
        fetchReportedRequirements(20),
      ]);
      setBlockers(blk);
      setRequirements(req);
    } catch (err: any) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('blockers')}
              className={`text-base sm:text-lg font-bold pb-1 border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === 'blockers'
                  ? 'border-status-danger text-status-danger'
                  : 'border-transparent text-content-muted hover:text-content'
              }`}
            >
              <AlertCircle className="h-4 w-4" /> Reported Blockers ({blockers.length})
            </button>
            <span className="text-content-muted text-sm">|</span>
            <button
              onClick={() => setActiveTab('requirements')}
              className={`text-base sm:text-lg font-bold pb-1 border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === 'requirements'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-content-muted hover:text-content'
              }`}
            >
              <HelpCircle className="h-4 w-4" /> Company Requirements ({requirements.length})
            </button>
          </div>
          <p className="text-xs text-content-muted mt-1">
            {activeTab === 'blockers'
              ? 'Obstacles and friction logged by team members in their submitted reports.'
              : 'Resource and operational requests submitted by employees and interns.'}
          </p>
        </div>

        <Button variant="outline" size="sm" onClick={loadData} className="gap-1.5 text-xs">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </CardHeader>

      <CardContent className="p-4 sm:p-6">
        {loading ? (
          <LoadingState text="Loading reported items..." />
        ) : error ? (
          <ErrorState title="Failed to load items" message={error.message} onRetry={loadData} />
        ) : activeTab === 'blockers' ? (
          blockers.length === 0 ? (
            <div className="text-center py-10 text-content-muted text-sm border border-dashed border-border rounded-lg">
              No blockers have been reported in submitted daily reports.
            </div>
          ) : (
            <div className="space-y-3">
              {blockers.map((item) => (
                <div
                  key={item.reportId}
                  className="p-3.5 bg-status-danger/5 border border-status-danger/20 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1 max-w-2xl">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-content">{item.userName}</span>
                      <span className="text-content-muted">({item.role} • {item.departmentName})</span>
                      <span className="text-content-muted">• {item.reportDate}</span>
                    </div>
                    <p className="text-content font-medium whitespace-pre-wrap">{item.blockerText}</p>
                  </div>
                  {onSelectReport && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onSelectReport(item.reportId)}
                      className="text-xs shrink-0 self-start sm:self-auto gap-1"
                    >
                      <Eye className="h-3.5 w-3.5" /> Open Report
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )
        ) : requirements.length === 0 ? (
          <div className="text-center py-10 text-content-muted text-sm border border-dashed border-border rounded-lg">
            No company requirements have been reported in submitted daily reports.
          </div>
        ) : (
          <div className="space-y-3">
            {requirements.map((item) => (
              <div
                key={item.reportId}
                className="p-3.5 bg-primary/5 border border-primary/20 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-1 max-w-2xl">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-content">{item.userName}</span>
                    <span className="text-content-muted">({item.role} • {item.departmentName})</span>
                    <span className="text-content-muted">• {item.reportDate}</span>
                  </div>
                  <p className="text-content font-medium whitespace-pre-wrap">{item.requirementText}</p>
                </div>
                {onSelectReport && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onSelectReport(item.reportId)}
                    className="text-xs shrink-0 self-start sm:self-auto gap-1"
                  >
                    <Eye className="h-3.5 w-3.5" /> Open Report
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
