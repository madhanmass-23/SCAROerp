import React from 'react';
import { cn } from './Button';

interface LoadingStateProps {
  text?: string;
  className?: string;
  showLogo?: boolean;
}

export const LoadingState: React.FC<LoadingStateProps> = ({ text = 'Loading...', className, showLogo = false }) => {
  return (
    <div className={cn("flex flex-col items-center justify-center p-8 text-center h-full min-h-[200px]", className)}>
      {showLogo && (
        <div className="mb-4">
          <img
            src="/assets/scaro-logo.png"
            alt="SCARO Logo"
            className="h-12 w-12 object-contain rounded-xl border border-border/40 bg-[#fbf7f2] shadow-sm animate-pulse"
          />
        </div>
      )}
      <svg className="animate-spin mb-4 h-8 w-8 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <p className="text-sm font-medium text-content-muted">{text}</p>
    </div>
  );
};
