import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from './Button';

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  position?: 'left' | 'right';
  className?: string;
}

export const Drawer: React.FC<DrawerProps> = ({
  isOpen,
  onClose,
  title,
  children,
  position = 'right',
  className,
}) => {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const isLeft = position === 'left';

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className={cn(
        'fixed inset-y-0 flex max-w-full',
        isLeft ? 'left-0 pr-10' : 'right-0 pl-10'
      )}>
        <div className={cn(
          'w-screen max-w-sm bg-surface shadow-xl flex flex-col border-border',
          isLeft ? 'border-r' : 'border-l',
          className
        )}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-border">
            <h2 className="text-base font-semibold text-content">{title || 'Menu'}</h2>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-md text-content-muted hover:text-content hover:bg-surface-muted transition-colors"
              aria-label="Close drawer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};
