import React from 'react';
import { cn } from './Button';

interface AvatarProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  fallback?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const Avatar: React.FC<AvatarProps> = ({ src, alt, fallback, size = 'md', className, ...props }) => {
  const [imageError, setImageError] = React.useState(false);

  const sizes = {
    sm: 'h-8 w-8 text-xs',
    md: 'h-10 w-10 text-sm',
    lg: 'h-12 w-12 text-base',
  };

  if (!src || imageError) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-full bg-primary-muted text-primary-hover font-medium",
          sizes[size],
          className
        )}
      >
        {fallback ? fallback.substring(0, 2).toUpperCase() : '??'}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      onError={() => setImageError(true)}
      className={cn("rounded-full object-cover", sizes[size], className)}
      {...props}
    />
  );
};
