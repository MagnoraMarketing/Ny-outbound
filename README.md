# Ny-outbound

Outbound salgsplatform til danske B2B-teams. Importér leads, ring fra
browseren, få samtalen optaget, transskriberet og vurderet af AI, og lad
opfølgningen oprette sig selv.

Flowet er: **Lead → Ring → Samtale → AI-analyse → Disposition → Opfølgning → Møde**

## Teknologi

- **Next.js 16** (App Router, React 19, Tailwind 4)
- **Supabase** til database og auth, med row level security på alle tabeller
- **Telnyx** Call Control og WebRTC til telefoni, optagelse og transskription
- **Claude** (`claude-opus-5`) til analyse af samtalerne

## Kom i gang

```bash
npm install
cp .env.example .env.local   # udfyld værdierne
npm run dev
```

### 1. Supabase

Opret et projekt og kør migrationerne i `supabase/migrations` i rækkefølge
(SQL-editoren i dashboardet, eller `supabase db push` med CLI'en). De opretter
skemaet, politikkerne og de triggere der giver en ny bruger en organisation,
en profil og et sæt standarddispositioner.

Hent `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` og
`SUPABASE_SERVICE_ROLE_KEY` under **Project Settings → API**.

### 2. Telnyx

1. Opret en **Call Control-applikation** (Voice → Call Control).
2. Sæt dens webhook-adresse til `https://<dit-domæne>/api/telnyx/webhook`.
   Adressen vises også under Indstillinger i appen.
3. Kopiér applikationens connection ID til `TELNYX_CONNECTION_ID`.
4. Hent API-nøglen og **public key** (Auth → API Keys / Public Key) til
   `TELNYX_API_KEY` og `TELNYX_PUBLIC_KEY`.
5. Køb et dansk nummer og sæt det som afsendernummer under Indstillinger.

Webhooken kræver `TELNYX_PUBLIC_KEY`: hver leverance verificeres med Ed25519,
og en request uden gyldig signatur afvises med 401.

### 3. Claude

Sæt `ANTHROPIC_API_KEY`. Analysen kører automatisk når en samtale er slut og
udskriften er klar, og kan startes manuelt igen fra siden med opkaldet.

## Kommandoer

| Kommando | Gør |
| --- | --- |
| `npm run dev` | Udviklingsserver |
| `npm run build` | Produktionsbuild |
| `npm run test` | Kører testene |
| `npm run typecheck` | Typetjek uden at bygge |
| `npm run lint` | ESLint |

## Sådan hænger det sammen

### Datamodel

Alt er knyttet til en `organizations`-række, og **alle** tabeller har row level
security der kun tillader adgang inden for egen organisation. Politikkerne
slår organisationen op gennem `public.current_org_id()`, som er
`SECURITY DEFINER` — ellers ville politikken på `profiles` slå sig selv op i en
uendelig løkke.

Centrale tabeller: `leads`, `lead_lists`, `dispositions`, `dialer_sessions`,
`calls`, `call_events`, `recordings`, `transcripts`, `call_ai_analysis`,
`activities`, `tasks`, `meetings`.

### Opkaldets vej gennem systemet

1. Dialeren henter en kø via `fetchQueue`, som filtrerer og sorterer efter
   reglerne i `src/lib/dialer/queue.ts`.
2. `POST /api/dialer/calls` opretter `calls`-rækken **før** der ringes, så et
   opkald aldrig forsvinder fordi browseren lukkede undervejs.
3. Browseren ringer op via Telnyx WebRTC, eller — i parallel-mode — ringer
   serveren selv ud på flere linjer gennem Call Control.
4. Webhooken opdaterer rækken undervejs: `ringing`, `answered`, `hangup`.
   Ved svar startes optagelse og transskription automatisk.
5. I parallel-mode kobles agenten sammen med det første lead der svarer, og de
   øvrige linjer lægges på med det samme.
6. Når udskriften er klar, analyserer Claude samtalen og gemmer referat,
   indvendinger, købssignaler, næste handling og coaching.
7. Sælgerens disposition sætter leadets status, opretter opfølgningen og
   booker mødet.

`client_state` (base64 i Telnyx' payload) bærer vores `callId` og `orgId` med
gennem hele forløbet, så en webhook altid kan finde den rigtige række.

### Idempotens

`call_events` har et unikt indeks på `telnyx_event_id`. Får vi den samme
hændelse to gange — hvilket Telnyx gør ved timeout — afbrydes behandlingen
efter det første forsøg i stedet for at tælle opkaldet med to gange.

## Test

```bash
npm run test
```

69 tests dækker den logik der kan gå galt uden at nogen opdager det:
nummernormalisering til E.164, gætning af kolonnenavne i CSV-import,
importvalidering, Ed25519-signaturverifikation (inklusive manipuleret body og
replay af gamle webhooks), køprioritering og validering af AI-svaret.

Databaseskemaet testes særskilt mod en rigtig Postgres:

```bash
psql "$DATABASE_URL" -f supabase/tests/harness.sql      # kun uden for Supabase
psql "$DATABASE_URL" -f supabase/migrations/20260907120000_init.sql
psql "$DATABASE_URL" -f supabase/migrations/20260907130000_agent_leg.sql
psql "$DATABASE_URL" -f supabase/tests/rls_test.sql
```

`rls_test.sql` opretter to organisationer og kontrollerer at de hverken kan
læse eller skrive i hinandens data — og at et forsøg på at skrive på tværs
bliver afvist af databasen, ikke bare af UI'et.

`harness.sql` efterligner de dele af Supabase-platformen (`auth.users`,
`auth.uid()`) som migrationerne bruger, så skemaet kan køres mod en almindelig
Postgres. Kør den **ikke** mod et rigtigt Supabase-projekt.

## Kendte begrænsninger

- **Telefonien er ikke afprøvet mod Telnyx.** Koden er skrevet efter Call
  Control- og WebRTC-API'erne, men der har ikke været adgang til en konto, så
  opkaldsforløbet er ikke verificeret ende til ende. Regn med justeringer
  første gang der ringes rigtigt — særligt omkring parallel-mode, hvor agenten
  skal have et ben at blive bygget sammen med.
- **AI-analysen er ikke kørt mod API'et.** Skema, prompt og fejlhåndtering er
  testet, men selve kaldet til Claude kræver en nøgle.
- **Databasetyperne er skrevet i hånden**, fordi `supabase gen types` kræver
  Docker. Ret dem sammen med migrationerne.
- **Talerfordelingen i udskriften** hviler på Telnyx' `track`-felt og er
  grovkornet. Dual-kanal-optagelse gør den bedre, men segmenternes
  tidsstempler udfyldes ikke endnu.
- `@telnyx/webrtc` trækker en sårbar `uuid`-version ind. Rettelsen kræver et
  nedgraderende hovedversionsskift af pakken, så den er ikke taget.
