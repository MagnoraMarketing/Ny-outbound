import Link from 'next/link';

/** Fejlbesked på login- og signup-siden, med vej videre når opsætning mangler. */
export function AuthError({
  error,
  setupNeeded,
}: {
  error: string;
  setupNeeded?: boolean;
}) {
  return (
    <div role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
      <p>{error}</p>
      {setupNeeded ? (
        <Link href="/opsaetning" className="mt-1 inline-block font-medium underline">
          Se hvad der mangler
        </Link>
      ) : null}
    </div>
  );
}
