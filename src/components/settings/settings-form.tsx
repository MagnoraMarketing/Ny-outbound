'use client';

import { useActionState } from 'react';

import { saveSettings, type SettingsState } from '@/app/(app)/indstillinger/actions';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import type { Organization, Profile } from '@/lib/supabase/database.types';

export function SettingsForm({
  profile,
  organization,
}: {
  profile: Profile;
  organization: Organization;
}) {
  const [state, formAction, pending] = useActionState<SettingsState, FormData>(
    saveSettings,
    {},
  );

  const canEditOrg = profile.role === 'owner' || profile.role === 'admin';

  return (
    <form action={formAction} className="space-y-6">
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-slate-900">Din profil</h2>

        <div className="space-y-1.5">
          <Label htmlFor="full_name">Navn</Label>
          <Input id="full_name" name="full_name" defaultValue={profile.full_name ?? ''} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="caller_id">Dit afsendernummer</Label>
          <Input
            id="caller_id"
            name="caller_id"
            defaultValue={profile.caller_id ?? ''}
            placeholder="+45 71 99 00 00"
          />
          <p className="text-xs text-slate-500">
            Vises hos modtageren når du ringer. Er feltet tomt, bruges organisationens nummer.
          </p>
        </div>
      </div>

      <div className="space-y-4 border-t border-slate-200 pt-6">
        <h2 className="text-sm font-semibold text-slate-900">Organisation</h2>

        <div className="space-y-1.5">
          <Label htmlFor="org_name">Firmanavn</Label>
          <Input
            id="org_name"
            name="org_name"
            defaultValue={organization.name}
            disabled={!canEditOrg}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="default_caller_id">Fælles afsendernummer</Label>
          <Input
            id="default_caller_id"
            name="default_caller_id"
            defaultValue={organization.default_caller_id ?? ''}
            placeholder="+45 71 99 00 00"
            disabled={!canEditOrg}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="telnyx_connection_id">Telnyx connection ID</Label>
          <Input
            id="telnyx_connection_id"
            name="telnyx_connection_id"
            defaultValue={organization.telnyx_connection_id ?? ''}
            placeholder="Udfyldes kun hvis I har jeres egen Call Control-app"
            disabled={!canEditOrg}
          />
          <p className="text-xs text-slate-500">
            Står feltet tomt, bruges den connection der er sat i TELNYX_CONNECTION_ID.
          </p>
        </div>

        {!canEditOrg ? (
          <p className="text-xs text-slate-500">
            Kun ejere og administratorer kan ændre organisationens opsætning.
          </p>
        ) : null}
      </div>

      {state.error ? (
        <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {state.error}
        </p>
      ) : null}

      {state.saved ? (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Gemt.</p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? 'Gemmer…' : 'Gem indstillinger'}
      </Button>
    </form>
  );
}
