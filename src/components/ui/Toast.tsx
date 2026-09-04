import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';
import { cn } from './Button';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType, duration?: number) => void;
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
  showInfo: (message: string) => void;
  showWarning: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: ToastType = 'info', duration = 4000) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts(prev => [...prev, { id, message, type, duration }]);

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
  }, [removeToast]);

  const showSuccess = useCallback((msg: string) => showToast(msg, 'success'), [showToast]);
  const showError = useCallback((msg: string) => showToast(msg, 'error', 6000), [showToast]);
  const showInfo = useCallback((msg: string) => showToast(msg, 'info'), [showToast]);
  const showWarning = useCallback((msg: string) => showToast(msg, 'warning', 5000), [showToast]);

  return (
    <ToastContext.Provider value={{ showToast, showSuccess, showError, showInfo, showWarning }}>
      {children}
      {/* Toast Render Container */}
      <div 
        aria-live="polite" 
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0"
      >
        {toasts.map(toast => {
          const isSuccess = toast.type === 'success';
          const isError = toast.type === 'error';
          const isWarning = toast.type === 'warning';

          return (
            <div
              key={toast.id}
              role="status"
              className={cn(
                'pointer-events-auto flex items-start gap-3 p-3.5 rounded-lg border shadow-lg transition-all duration-300 transform translate-y-0 text-sm bg-surface',
                isSuccess && 'border-status-success/30 text-content bg-emerald-50/90 dark:bg-emerald-950/80',
                isError && 'border-status-danger/30 text-content bg-red-50/90 dark:bg-red-950/80',
                isWarning && 'border-status-warning/30 text-content bg-amber-50/90 dark:bg-amber-950/80',
                toast.type === 'info' && 'border-status-info/30 text-content bg-blue-50/90 dark:bg-blue-950/80'
              )}
            >
              <div className="shrink-0 mt-0.5">
                {isSuccess && <CheckCircle2 className="h-5 w-5 text-status-success" />}
                {isError && <AlertCircle className="h-5 w-5 text-status-danger" />}
                {isWarning && <AlertTriangle className="h-5 w-5 text-status-warning" />}
                {toast.type === 'info' && <Info className="h-5 w-5 text-status-info" />}
              </div>
              <div className="flex-1 font-medium text-xs sm:text-sm leading-snug break-words">
                {toast.message}
              </div>
              <button
                type="button"
                onClick={() => removeToast(toast.id)}
                className="shrink-0 text-content-muted hover:text-content p-0.5 rounded transition-colors"
                aria-label="Dismiss notification"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    // Fallback safe dummy implementation if called outside provider
    return {
      showToast: (m: string) => console.log('Toast:', m),
      showSuccess: (m: string) => console.log('Toast Success:', m),
      showError: (m: string) => console.error('Toast Error:', m),
      showInfo: (m: string) => console.log('Toast Info:', m),
      showWarning: (m: string) => console.warn('Toast Warning:', m)
    };
  }
  return context;
};
