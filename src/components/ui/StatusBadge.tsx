import React from 'react';
import { cn } from './Button';

interface StatusBadgeProps {
  status: string | null | undefined;
  size?: 'sm' | 'md';
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md', className }) => {
  if (!status) return null;

  const normalized = status.trim();

  // Color mapping based on PostgreSQL core enums
  let styleClasses = 'bg-surface-muted text-content-muted border-border';

  switch (normalized.toLowerCase()) {
    // Success / Completed / Present / Approved / Synced
    case 'completed':
    case 'present':
    case 'approved':
    case 'synced':
    case 'submitted':
    case 'active':
      styleClasses = 'bg-status-success/10 text-status-success border-status-success/20';
      break;

    // In Progress / Review / Scheduled / Processing / Medium
    case 'in progress':
    case 'review':
    case 'scheduled':
    case 'processing':
    case 'medium':
      styleClasses = 'bg-primary/10 text-primary border-primary/20';
      break;

    // Warning / Needs Revision / Half Day / Pending / Draft / High
    case 'needs revision':
    case 'half day':
    case 'pending':
    case 'draft':
    case 'high':
      styleClasses = 'bg-status-warning/10 text-status-warning border-status-warning/20';
      break;

    // Danger / Cancelled / Absent / Rejected / Failed / Urgent / Inactive
    case 'inactive':
    case 'cancelled':
    case 'absent':
    case 'rejected':
    case 'failed':
    case 'permanently_failed':
    case 'urgent':
      styleClasses = 'bg-status-danger/10 text-status-danger border-status-danger/20';
      break;

    // Info / Todo / On Hold / Low
    case 'todo':
    case 'on hold':
    case 'low':
    case 'normal':
      styleClasses = 'bg-status-info/10 text-status-info border-status-info/20';
      break;

    // Role tags
    case 'super admin':
      styleClasses = 'bg-purple-50 text-purple-700 border-purple-200';
      break;
    case 'admin':
      styleClasses = 'bg-blue-50 text-blue-700 border-blue-200';
      break;
    case 'employee':
      styleClasses = 'bg-emerald-50 text-emerald-700 border-emerald-200';
      break;
    case 'intern':
      styleClasses = 'bg-amber-50 text-amber-700 border-amber-200';
      break;
  }

  const sizeClasses = size === 'sm' 
    ? 'px-2 py-0.5 text-[11px]' 
    : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={cn(
        'inline-flex items-center font-medium rounded-md border tracking-tight',
        sizeClasses,
        styleClasses,
        className
      )}
    >
      {normalized}
    </span>
  );
};
