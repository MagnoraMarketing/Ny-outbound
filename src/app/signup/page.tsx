'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { signup, type AuthFormState } from '../login/actions';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { AuthError } from '@/components/ui/auth-error';

export default function SignupPage() {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(signup, {});

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Opret organisation
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Du bliver ejer og kan invitere resten af teamet bagefter.
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <form action={formAction} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="org_name">Firmanavn</Label>
              <Input id="org_name" name="org_name" required />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="full_name">Dit navn</Label>
              <Input id="full_name" name="full_name" autoComplete="name" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Adgangskode</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
              <p className="text-xs text-slate-500">Mindst 8 tegn.</p>
            </div>

            {state.error ? (
              <AuthError error={state.error} setupNeeded={state.setupNeeded} />
            ) : null}

            <Button type="submit" size="lg" className="w-full" disabled={pending}>
              {pending ? 'Opretter…' : 'Opret konto'}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-slate-500">
          Har du allerede en konto?{' '}
          <Link href="/login" className="font-medium text-brand-600 hover:text-brand-700">
            Log ind
          </Link>
        </p>
      </div>
    </main>
  );
}
