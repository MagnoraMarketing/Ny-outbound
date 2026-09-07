import Link from 'next/link';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';

import { isSupabaseConfigured, setupStatus } from '@/lib/setup';

export const dynamic = 'force-dynamic';

/**
 * Vises når appen ikke er konfigureret færdig, eller når en indlogget bruger
 * mangler profil og organisation. Formålet er at fortælle præcis hvad der
 * står i vejen i stedet for at lade brugeren møde en 500-side.
 */
export default function SetupPage() {
  const groups = setupStatus();
  const supabaseReady = isSupabaseConfigured();
  const blocking = groups.filter((g) => g.required && g.problems.length > 0);

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-xl font-semibold tracking-tight text-slate-900">
        Ny-outbound er ikke sat op endnu
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        {blocking.length > 0
          ? 'Der mangler nogle værdier, før appen kan starte.'
          : 'Miljøvariablerne er på plads. Så mangler databasen formentlig sit skema.'}
      </p>

      <ul className="mt-6 space-y-3">
        {groups.map((group) => {
          const ok = group.problems.length === 0;
          return (
            <li
              key={group.name}
              className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start gap-3">
                {ok ? (
                  <CheckCircle2
                    className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600"
                    aria-hidden
                  />
                ) : group.required ? (
                  <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" aria-hidden />
                ) : (
                  <AlertTriangle
                    className="mt-0.5 h-5 w-5 shrink-0 text-amber-500"
                    aria-hidden
                  />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">
                    {group.name}
                    <span className="ml-2 text-xs font-normal text-slate-500">
                      {ok ? 'klar' : group.required ? 'påkrævet' : 'valgfri'}
                    </span>
                  </p>
                  <p className="mt-0.5 text-sm text-slate-600">{group.description}</p>
                  {!ok ? (
                    <ul className="mt-2 space-y-1.5">
                      {group.problems.map((problem) => (
                        <li key={problem.name}>
                          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-800">
                            {problem.name}
                          </code>
                          <span className="ml-2 text-xs text-slate-500">
                            {problem.issue === 'missing' ? 'mangler' : 'ugyldig værdi'}
                          </span>
                          {problem.hint ? (
                            <p className="mt-0.5 text-xs text-slate-600">{problem.hint}</p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-8 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <h2 className="text-sm font-semibold text-slate-900">Sådan kommer du videre</h2>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-slate-700">
          <li>
            Sæt de manglende variabler. Lokalt i <code className="rounded bg-white px-1">.env.local</code>{' '}
            efter <code className="rounded bg-white px-1">.env.example</code>; på Vercel under
            Project Settings → Environment Variables, og deploy derefter igen.
          </li>
          <li>
            Kør migrationerne i{' '}
            <code className="rounded bg-white px-1">supabase/migrations</code> mod
            Supabase-projektet. De opretter skemaet og den trigger der giver en ny bruger
            en organisation og en profil.
          </li>
          <li>Opret en konto, og sæt et afsendernummer under Indstillinger.</li>
        </ol>
      </div>

      {supabaseReady ? (
        <div className="mt-6 flex items-center gap-4">
          <Link href="/dashboard" className="text-sm font-medium text-brand-600 underline">
            Prøv igen
          </Link>
          <form action="/auth/signout" method="post">
            <button type="submit" className="text-sm text-slate-500 underline hover:text-slate-900">
              Log ud
            </button>
          </form>
        </div>
      ) : null}
    </main>
  );
}
