import * as React from 'react';

import { cn } from '@/lib/utils';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          'block w-full rounded-md border-0 px-3 py-2 text-sm text-slate-900 shadow-sm',
          'ring-1 ring-inset ring-slate-300 placeholder:text-slate-400',
          'focus:ring-2 focus:ring-inset focus:ring-brand-600',
          'disabled:cursor-not-allowed disabled:bg-slate-50',
          className,
        )}
        {...props}
      />
    );
  },
);

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, ...props }, ref) {
  return (
    <select
      ref={ref}
      className={cn(
        'block w-full rounded-md border-0 py-2 pl-3 pr-8 text-sm text-slate-900 shadow-sm',
        'ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-brand-600',
        className,
      )}
      {...props}
    />
  );
});

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        'block w-full rounded-md border-0 px-3 py-2 text-sm text-slate-900 shadow-sm',
        'ring-1 ring-inset ring-slate-300 placeholder:text-slate-400',
        'focus:ring-2 focus:ring-inset focus:ring-brand-600',
        className,
      )}
      {...props}
    />
  );
});

export function Label({
  children,
  htmlFor,
}: {
  children: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700">
      {children}
    </label>
  );
}
