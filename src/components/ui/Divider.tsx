import React from 'react';
import { cn } from './Button';

interface DividerProps extends React.HTMLAttributes<HTMLHRElement> {
  orientation?: 'horizontal' | 'vertical';
}

export const Divider: React.FC<DividerProps> = ({ className, orientation = 'horizontal', ...props }) => {
  return (
    <hr
      className={cn(
        "border-border",
        orientation === 'horizontal' ? "w-full border-t my-4" : "h-full border-l mx-4 inline-block align-middle",
        className
      )}
      {...props}
    />
  );
};
