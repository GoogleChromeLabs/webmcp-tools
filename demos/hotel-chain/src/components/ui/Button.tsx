/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'on-tertiary';
  size?: 'sm' | 'md' | 'lg' | 'full';
  icon?: string;
}

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  icon,
  children,
  ...props
}: ButtonProps) {
  const variants = {
    primary: 'bg-primary text-on-primary hover:bg-primary/90 shadow-md',
    secondary: 'bg-secondary text-on-secondary hover:bg-secondary/90 shadow-sm',
    outline: 'bg-transparent border border-outline-variant text-primary hover:bg-surface-container-low',
    ghost: 'bg-transparent border-none text-primary hover:underline underline-offset-8',
    'on-tertiary': 'text-on-tertiary-container font-bold bg-transparent border-none hover:underline underline-offset-8 transition-all',
  };

  const sizes = {
    sm: 'px-4 py-2 text-xs',
    md: 'px-6 py-3 text-sm font-semibold',
    lg: 'px-10 py-4 text-lg font-bold',
    full: 'w-full py-5 text-lg font-bold',
  };

  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg transition-all duration-300 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none cursor-pointer',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {icon && <span className="material-symbols-outlined text-[1.25em]" aria-hidden="true">{icon}</span>}
      {children}
    </button>
  );
}
