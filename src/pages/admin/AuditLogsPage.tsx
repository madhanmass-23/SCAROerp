import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { PageHeader } from '../../components/ui/PageHeader';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadingState } from '../../components/ui/LoadingState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Card } from '../../components/ui/Card';
import { Select } from '../../components/ui/Select';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Shield, Eye, Clock, User, Filter } from 'lucide-react';

interface AuditLog {
  id: string;
  table_name: string;
  action: string;
  record_id: string;
  actor_id: string;
  old_value: any;
  new_value: any;
  created_at: string;
  ip_address?: string;
  actor?: {
    full_name: string;
    email: string;
  };
}

export const AuditLogsPage: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState('ALL');
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  useEffect(() => {
    fetchLogs();
  }, [actionFilter]);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      setError(null);

      let query = supabase
        .from('audit_logs')
        .select(`
          id, table_name, action, record_id, actor_id, old_value, new_value, created_at,
          actor:actor_id ( full_name, email )
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      if (actionFilter !== 'ALL') {
        query = query.eq('action', actionFilter);
      }

      const { data, error: lErr } = await query;
      if (lErr) throw lErr;

      const mapped: AuditLog[] = (data || []).map((l: any) => ({
        ...l,
        actor: Array.isArray(l.actor) ? l.actor[0] : l.actor
      }));

      setLogs(mapped);
    } catch (err: any) {
      console.error('Error fetching audit logs:', err);
      setError(err.message || 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <LoadingState text="Loading security audit records..." />;
  if (error) return <ErrorState message={error} onRetry={fetchLogs} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Security & System Audit Logs"
        description="Immutable record of system security, role mutations, and sensitive operations"
        icon={<Shield className="h-6 w-6" />}
        actions={
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-content-muted" />
            <Select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="h-9 text-xs"
            >
              <option value="ALL">All Actions</option>
              <option value="INSERT">INSERT</option>
              <option value="UPDATE">UPDATE</option>
              <option value="DELETE">DELETE</option>
              <option value="ROLE_ASSIGNED">ROLE_ASSIGNED</option>
              <option value="ROLE_REVOKED">ROLE_REVOKED</option>
            </Select>
          </div>
        }
      />

      {logs.length === 0 ? (
        <EmptyState
          title="No audit logs found"
          description="Operational events and security mutations will be securely logged here."
          icon={<Shield className="h-10 w-10 text-content-muted" />}
        />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-content">
              <thead className="bg-surface-muted border-b border-border text-content-muted uppercase tracking-wider font-semibold">
                <tr>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Target Table</th>
                  <th className="py-3 px-4">Actor</th>
                  <th className="py-3 px-4 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-surface-muted/50 transition-colors">
                    <td className="py-3 px-4 whitespace-nowrap text-content-muted">
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" />
                        {new Date(log.created_at).toLocaleString()}
                      </div>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <StatusBadge status={log.action} size="sm" />
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap font-mono text-content">
                      {log.table_name}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5 text-content-muted" />
                        <span>{log.actor?.full_name || log.actor?.email || 'System'}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSelectedLog(log)}
                        className="h-7 px-2 text-xs"
                      >
                        <Eye className="h-3.5 w-3.5 mr-1" /> Inspect
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* JSON Diff / Payload Inspector Modal */}
      {selectedLog && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedLog(null)}
          title={`Audit Log Record: ${selectedLog.action} on ${selectedLog.table_name}`}
        >
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-2 p-3 bg-surface-muted rounded-lg border border-border">
              <div>
                <span className="text-content-muted">Record ID:</span>{' '}
                <span className="font-mono">{selectedLog.record_id || 'N/A'}</span>
              </div>
              <div>
                <span className="text-content-muted">Timestamp:</span>{' '}
                <span>{new Date(selectedLog.created_at).toLocaleString()}</span>
              </div>
              <div>
                <span className="text-content-muted">Actor:</span>{' '}
                <span>{selectedLog.actor?.full_name || selectedLog.actor_id}</span>
              </div>
              {selectedLog.ip_address && (
                <div>
                  <span className="text-content-muted">IP Address:</span>{' '}
                  <span className="font-mono">{selectedLog.ip_address}</span>
                </div>
              )}
            </div>

            {selectedLog.old_value && (
              <div>
                <h4 className="font-semibold text-content mb-1">Previous State (old_value):</h4>
                <pre className="p-3 bg-gray-900 text-gray-100 rounded-lg overflow-x-auto text-[11px] font-mono max-h-48">
                  {JSON.stringify(selectedLog.old_value, null, 2)}
                </pre>
              </div>
            )}

            {selectedLog.new_value && (
              <div>
                <h4 className="font-semibold text-content mb-1">New State (new_value):</h4>
                <pre className="p-3 bg-gray-900 text-gray-100 rounded-lg overflow-x-auto text-[11px] font-mono max-h-48">
                  {JSON.stringify(selectedLog.new_value, null, 2)}
                </pre>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button onClick={() => setSelectedLog(null)} size="sm">
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
