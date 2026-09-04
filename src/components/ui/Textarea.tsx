import React from 'react';
import { cn } from './Button';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-content mb-1">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          className={cn(
            "flex min-h-[80px] w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-content ring-offset-surface placeholder:text-content-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 transition-colors hover:border-border-hover",
            error && "border-status-danger focus-visible:ring-status-danger",
            className
          )}
          {...props}
        />
        {error && (
          <p className="mt-1 text-sm text-status-danger">{error}</p>
        )}
      </div>
    );
  }
);
Textarea.displayName = 'Textarea';
