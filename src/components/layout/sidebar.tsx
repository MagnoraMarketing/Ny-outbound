'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  CalendarClock,
  ListChecks,
  PhoneCall,
  Settings,
  Users,
} from 'lucide-react';

import { cn } from '@/lib/utils';

const NAV = [
  { href: '/dashboard', label: 'Overblik', icon: BarChart3 },
  { href: '/leads', label: 'Leads', icon: Users },
  { href: '/dialer', label: 'Dialer', icon: PhoneCall },
  { href: '/opkald', label: 'Opkald', icon: ListChecks },
  { href: '/opgaver', label: 'Opgaver', icon: CalendarClock },
  { href: '/indstillinger', label: 'Indstillinger', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col gap-0.5 px-3" aria-label="Hovedmenu">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-brand-50 text-brand-700'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
