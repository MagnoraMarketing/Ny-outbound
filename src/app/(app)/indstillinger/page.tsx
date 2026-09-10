import { headers } from 'next/headers';

import { requireSession } from '@/lib/auth';
import { appUrl } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/layout/page-header';
import { SettingsForm } from '@/components/settings/settings-form';
import { Card, CardHeader } from '@/components/ui/card';
import { DISPOSITION_CATEGORY_LABELS } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const { profile, organization } = await requireSession();
  const supabase = await createClient();

  const [{ data: dispositions }, { data: colleagues }] = await Promise.all([
    supabase.from('dispositions').select('*').order('sort_order', { ascending: true }),
    supabase.from('profiles').select('id, full_name, email, role').order('created_at'),
  ]);

  // Vis den adresse Telnyx rent faktisk får at vide - altså den samme
  // env.appUrl() bruger når der ringes ud. Ellers kan siden vise noget andet
  // end det systemet gør, og fejlen bliver først synlig når opkald forsvinder.
  const configuredUrl = appUrl();
  const webhookUrl = `${configuredUrl}/api/telnyx/webhook`;

  // Adressen browseren står på lige nu. Passer den ikke med den appen sender
  // til Telnyx, ville opkaldshændelser lande et andet sted. På Vercel kommer
  // adressen fra platformen selv, så det bør ikke kunne ske der.
  const host = (await headers()).get('host');
  const looksWrong = Boolean(host) && !configuredUrl.includes(host!);

  return (
    <>
      <PageHeader title="Indstillinger" description="Afsendernummer, team og opsætning." />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Profil og organisation" />
          <div className="p-4">
            <SettingsForm profile={profile} organization={organization} />
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Telnyx-webhook" description="Indsæt denne adresse i din Call Control-applikation." />
            <div className="space-y-2 p-4">
              <code className="block break-all rounded-md bg-slate-100 px-3 py-2 text-xs text-slate-800">
                {webhookUrl}
              </code>
              {looksWrong ? (
                <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Adressen peger ikke på den app du sidder i ({host}), så Telnyx ville sende
                  opkaldshændelser det forkerte sted hen. På Vercel kommer adressen fra
                  platformen selv; kører appen et andet sted, er det{' '}
                  <code className="rounded bg-amber-100 px-1">NEXT_PUBLIC_APP_URL</code> der
                  skal rettes.
                </p>
              ) : null}
            </div>
          </Card>

          <Card>
            <CardHeader title="Team" description={`${colleagues?.length ?? 0} brugere`} />
            <ul className="divide-y divide-slate-100">
              {(colleagues ?? []).map((person) => (
                <li key={person.id} className="px-4 py-2.5">
                  <p className="text-sm text-slate-900">{person.full_name ?? person.email}</p>
                  <p className="text-xs text-slate-500">{person.role}</p>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Dispositioner" description="Udfald der kan vælges efter et opkald." />
            <ul className="divide-y divide-slate-100">
              {(dispositions ?? []).map((disposition) => (
                <li
                  key={disposition.id}
                  className="flex items-center justify-between gap-3 px-4 py-2"
                >
                  <span className="text-sm text-slate-900">{disposition.name}</span>
                  <span className="text-xs text-slate-500">
                    {DISPOSITION_CATEGORY_LABELS[disposition.category]}
                    {disposition.follow_up_hours
                      ? ` · ${disposition.follow_up_hours} t`
                      : ''}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
