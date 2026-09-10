import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

import { isValidHttpUrl, readEnv } from '@/lib/setup';

/**
 * `/opsaetning` er med her med vilje. Siden forklarer hvorfor man ikke kan
 * komme ind, så den skal kunne nås netop når man ikke er logget ind - ellers
 * sender proxyen brugeren til login, som linker tilbage til opsætningssiden,
 * som sender til login. Siden viser kun navnene på de variabler der mangler
 * og projektets offentlige reference, aldrig en nøgle.
 */
const PUBLIC_ROUTES = ['/login', '/signup', '/auth', '/opsaetning'];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabaseUrl = readEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseKey = readEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

  // Uden brugbar Supabase-konfiguration kan vi ikke afgøre noget om sessionen.
  // Lad requesten passere, så opsætningssiden kan nå at forklare hvorfor.
  //
  // URL'en valideres her og ikke kun for tilstedeværelse: createServerClient
  // kaster på en ugyldig adresse, og en fejl i proxyen rammer hver eneste
  // rute med en bar 500 - også opsætningssiden der skulle forklare fejlen.
  if (!isValidHttpUrl(supabaseUrl) || !supabaseKey) {
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser() validerer tokenet mod Supabase og fornyer sessionen.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (user && (pathname === '/login' || pathname === '/signup')) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Alle sider undtagen statiske filer, billeder og Telnyx-webhooken,
     * som autentificeres med Ed25519-signatur i stedet for cookies.
     */
    '/((?!_next/static|_next/image|favicon.ico|api/telnyx/webhook|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
