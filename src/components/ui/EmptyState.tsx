import React from 'react';
import { cn } from './Button';
import { FolderOpen } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ 
  title, 
  description, 
  icon = <FolderOpen className="h-10 w-10 text-content-muted" />, 
  action, 
  className 
}) => {
  return (
    <div className={cn("flex flex-col items-center justify-center p-8 text-center bg-surface border border-border border-dashed rounded-lg", className)}>
      <div className="mb-4 text-content-muted">
        {icon}
      </div>
      <h3 className="text-lg font-medium text-content mb-1">{title}</h3>
      {description && <p className="text-sm text-content-muted max-w-sm mb-4">{description}</p>}
      {action && <div>{action}</div>}
    </div>
  );
};
