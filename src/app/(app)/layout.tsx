import { PhoneOutgoing } from 'lucide-react';

import { requireSession } from '@/lib/auth';
import { Sidebar } from '@/components/layout/sidebar';
import { initials } from '@/lib/utils';

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { profile, organization } = await requireSession();

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white py-4 lg:flex">
        <div className="flex items-center gap-2 px-6 pb-6">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-600 text-white">
            <PhoneOutgoing className="h-4 w-4" aria-hidden />
          </span>
          <span className="text-sm font-semibold text-slate-900">Ny-outbound</span>
        </div>

        <Sidebar />

        <div className="mt-auto border-t border-slate-200 px-3 pt-4">
          <div className="flex items-center gap-3 px-3 py-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">
              {initials(profile.full_name ?? profile.email)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-900">
                {profile.full_name ?? profile.email}
              </p>
              <p className="truncate text-xs text-slate-500">{organization.name}</p>
            </div>
          </div>
          <form action="/auth/signout" method="post" className="px-3 pb-1">
            <button
              type="submit"
              className="text-xs font-medium text-slate-500 hover:text-slate-900"
            >
              Log ud
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
