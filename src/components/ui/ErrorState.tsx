import React from 'react';
import { cn } from './Button';
import { AlertTriangle } from 'lucide-react';
import { Button } from './Button';

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({ 
  title = 'Something went wrong', 
  message = 'An unexpected error occurred while loading this content.', 
  onRetry, 
  className 
}) => {
  return (
    <div className={cn("flex flex-col items-center justify-center p-8 text-center bg-red-50 border border-red-200 rounded-lg", className)}>
      <div className="mb-4 text-status-danger">
        <AlertTriangle className="h-10 w-10" />
      </div>
      <h3 className="text-lg font-medium text-status-danger mb-2">{title}</h3>
      <p className="text-sm text-red-700 max-w-sm mb-4">{message}</p>
      {onRetry && (
        <Button variant="danger" onClick={onRetry}>
          Try Again
        </Button>
      )}
    </div>
  );
};
