import Link from 'next/link';

/**
 * Landingsside når en bruger er logget ind, men mangler profil eller
 * organisation - i praksis fordi migrationerne ikke er lagt på databasen.
 */
export default function SetupPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl items-center px-4 py-12">
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-6">
        <h1 className="text-lg font-semibold text-amber-900">Databasen mangler opsætning</h1>
        <p className="mt-2 text-sm text-amber-800">
          Din bruger findes, men der er hverken en profil eller en organisation knyttet til
          den. Det sker typisk når skemaet endnu ikke er lagt på Supabase-projektet, så
          triggeren <code className="rounded bg-amber-100 px-1">handle_new_user</code> aldrig
          er kørt.
        </p>
        <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-amber-800">
          <li>
            Kør migrationerne i <code className="rounded bg-amber-100 px-1">supabase/migrations</code>{' '}
            mod dit projekt.
          </li>
          <li>Log ud og opret kontoen igen, så triggeren opretter organisationen.</li>
        </ol>
        <div className="mt-6">
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="text-sm font-medium text-amber-900 underline hover:text-amber-950"
            >
              Log ud
            </button>
          </form>
          <Link href="/dashboard" className="mt-2 inline-block text-sm text-amber-800 underline">
            Prøv igen
          </Link>
        </div>
      </div>
    </main>
  );
}
