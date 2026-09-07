import { cn } from '@/lib/utils';

export function Badge({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        'bg-slate-100 text-slate-700 ring-slate-600/20',
        className,
      )}
    >
      {children}
    </span>
  );
}
