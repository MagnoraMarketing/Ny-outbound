-- Ny-outbound: B2B outbound salgsplatform
-- Grundskema med multi-tenant isolation via organisations-id og RLS.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.user_role as enum ('owner', 'admin', 'agent');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.lead_status as enum (
    'new',            -- Ny
    'attempting',     -- Forsøgt kontaktet
    'contacted',      -- Kontaktet
    'qualified',      -- Kvalificeret
    'meeting_booked', -- Møde booket
    'won',            -- Vundet
    'lost',           -- Tabt
    'dnc'             -- Må ikke kontaktes
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.call_direction as enum ('outbound', 'inbound');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.call_status as enum (
    'queued',
    'initiated',
    'ringing',
    'answered',
    'completed',
    'busy',
    'no_answer',
    'failed',
    'canceled',
    'voicemail'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.disposition_category as enum (
    'connected',
    'no_answer',
    'not_interested',
    'meeting',
    'callback',
    'dnc',
    'wrong_number'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.dialer_mode as enum ('manual', 'power', 'parallel');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.dialer_session_status as enum ('active', 'paused', 'ended');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.task_status as enum ('open', 'done', 'canceled');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.activity_type as enum (
    'call',
    'note',
    'status_change',
    'email',
    'meeting',
    'import',
    'ai_analysis'
  );
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Organisationer og brugere
-- ---------------------------------------------------------------------------

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- Standard afsendernummer i E.164, fx +4571990000
  default_caller_id text,
  -- Telnyx connection (Call Control application) som organisationen ringer via
  telnyx_connection_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  email text not null,
  full_name text,
  role public.user_role not null default 'agent',
  -- Personligt afsendernummer, falder tilbage til organisationens
  caller_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_org_id_idx on public.profiles (org_id);

-- Slår den aktuelle brugers organisation op uden om RLS, så politikker
-- der selv læser profiles ikke ender i uendelig rekursion.
create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from public.profiles where id = auth.uid();
$$;

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Leads
-- ---------------------------------------------------------------------------

create table if not exists public.lead_lists (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  description text,
  source text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists lead_lists_org_id_idx on public.lead_lists (org_id);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  list_id uuid references public.lead_lists (id) on delete set null,
  owner_id uuid references public.profiles (id) on delete set null,

  company_name text not null,
  cvr text,
  contact_name text,
  title text,
  phone text,
  mobile text,
  email text,
  website text,
  address text,
  postal_code text,
  city text,
  industry text,
  employees integer,

  status public.lead_status not null default 'new',
  score integer not null default 0,
  notes text,
  custom_fields jsonb not null default '{}'::jsonb,

  do_not_call boolean not null default false,
  call_attempts integer not null default 0,
  last_call_at timestamptz,
  next_follow_up_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leads_org_id_idx on public.leads (org_id);
create index if not exists leads_org_status_idx on public.leads (org_id, status);
create index if not exists leads_list_id_idx on public.leads (list_id);
create index if not exists leads_next_follow_up_idx on public.leads (org_id, next_follow_up_at)
  where next_follow_up_at is not null;
-- Samme telefonnummer må kun optræde én gang pr. organisation
create unique index if not exists leads_org_phone_uniq on public.leads (org_id, phone)
  where phone is not null;

-- ---------------------------------------------------------------------------
-- Dispositioner (udfald af et opkald)
-- ---------------------------------------------------------------------------

create table if not exists public.dispositions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  code text not null,
  name text not null,
  category public.disposition_category not null,
  is_positive boolean not null default false,
  -- Status som leadet automatisk sættes til når dispositionen vælges
  sets_lead_status public.lead_status,
  -- Antal timer til automatisk opfølgning, null = ingen
  follow_up_hours integer,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (org_id, code)
);

create index if not exists dispositions_org_id_idx on public.dispositions (org_id);

-- ---------------------------------------------------------------------------
-- Dialer-sessioner og opkald
-- ---------------------------------------------------------------------------

create table if not exists public.dialer_sessions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  list_id uuid references public.lead_lists (id) on delete set null,
  mode public.dialer_mode not null default 'power',
  -- Antal samtidige linjer i parallel-mode
  lines integer not null default 1,
  status public.dialer_session_status not null default 'active',
  calls_made integer not null default 0,
  calls_connected integer not null default 0,
  meetings_booked integer not null default 0,
  talk_seconds integer not null default 0,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create index if not exists dialer_sessions_org_user_idx on public.dialer_sessions (org_id, user_id);

create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  lead_id uuid references public.leads (id) on delete set null,
  user_id uuid references public.profiles (id) on delete set null,
  session_id uuid references public.dialer_sessions (id) on delete set null,
  disposition_id uuid references public.dispositions (id) on delete set null,

  direction public.call_direction not null default 'outbound',
  status public.call_status not null default 'queued',

  telnyx_call_control_id text,
  telnyx_call_session_id text,
  telnyx_call_leg_id text,

  from_number text,
  to_number text,

  started_at timestamptz,
  answered_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer,
  talk_seconds integer,
  hangup_cause text,

  disposition_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists calls_org_id_idx on public.calls (org_id);
create index if not exists calls_lead_id_idx on public.calls (lead_id);
create index if not exists calls_session_id_idx on public.calls (session_id);
create index if not exists calls_org_created_idx on public.calls (org_id, created_at desc);
create unique index if not exists calls_call_control_id_uniq on public.calls (telnyx_call_control_id)
  where telnyx_call_control_id is not null;

-- Rå webhook-hændelser, gemt så et opkaldsforløb kan genafspilles ved fejlsøgning
create table if not exists public.call_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations (id) on delete cascade,
  call_id uuid references public.calls (id) on delete cascade,
  event_type text not null,
  telnyx_event_id text,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists call_events_call_id_idx on public.call_events (call_id);
create unique index if not exists call_events_telnyx_event_uniq on public.call_events (telnyx_event_id)
  where telnyx_event_id is not null;

create table if not exists public.recordings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  call_id uuid not null references public.calls (id) on delete cascade,
  telnyx_recording_id text,
  url text not null,
  format text not null default 'mp3',
  channels text not null default 'dual',
  duration_seconds integer,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

create index if not exists recordings_call_id_idx on public.recordings (call_id);

create table if not exists public.transcripts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  call_id uuid not null references public.calls (id) on delete cascade,
  recording_id uuid references public.recordings (id) on delete set null,
  provider text not null default 'telnyx',
  language text not null default 'da',
  text text not null,
  -- Segmenter: [{ "speaker": "agent", "start": 0.0, "end": 4.2, "text": "..." }]
  segments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists transcripts_call_id_uniq on public.transcripts (call_id);

create table if not exists public.call_ai_analysis (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  call_id uuid not null references public.calls (id) on delete cascade,

  summary text not null,
  sentiment text,
  outcome text,
  -- Indvendinger: [{ "type": "pris", "quote": "...", "handled": false }]
  objections jsonb not null default '[]'::jsonb,
  -- Købssignaler som fritekst-liste
  buying_signals jsonb not null default '[]'::jsonb,
  next_action text,
  suggested_disposition_code text,
  suggested_follow_up_at timestamptz,
  -- Coaching: { "styrker": [...], "forbedringer": [...] }
  coaching jsonb not null default '{}'::jsonb,
  lead_score integer,

  model text not null,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now()
);

create unique index if not exists call_ai_analysis_call_id_uniq on public.call_ai_analysis (call_id);

-- ---------------------------------------------------------------------------
-- Aktiviteter, opgaver og møder
-- ---------------------------------------------------------------------------

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  lead_id uuid references public.leads (id) on delete cascade,
  call_id uuid references public.calls (id) on delete set null,
  user_id uuid references public.profiles (id) on delete set null,
  type public.activity_type not null,
  title text not null,
  body text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activities_lead_id_idx on public.activities (lead_id, created_at desc);
create index if not exists activities_org_id_idx on public.activities (org_id, created_at desc);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  lead_id uuid references public.leads (id) on delete cascade,
  assigned_to uuid references public.profiles (id) on delete set null,
  call_id uuid references public.calls (id) on delete set null,
  title text not null,
  description text,
  due_at timestamptz not null,
  status public.task_status not null default 'open',
  -- 'manual', 'disposition' eller 'ai'
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists tasks_org_due_idx on public.tasks (org_id, status, due_at);
create index if not exists tasks_lead_id_idx on public.tasks (lead_id);

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  lead_id uuid not null references public.leads (id) on delete cascade,
  booked_by uuid references public.profiles (id) on delete set null,
  call_id uuid references public.calls (id) on delete set null,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  notes text,
  outcome text,
  created_at timestamptz not null default now()
);

create index if not exists meetings_org_starts_idx on public.meetings (org_id, starts_at);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace trigger organizations_set_updated_at before update on public.organizations
  for each row execute function public.set_updated_at();
create or replace trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create or replace trigger leads_set_updated_at before update on public.leads
  for each row execute function public.set_updated_at();
create or replace trigger calls_set_updated_at before update on public.calls
  for each row execute function public.set_updated_at();

-- Standarddispositioner som enhver ny organisation starter med.
create or replace function public.seed_default_dispositions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.dispositions
    (org_id, code, name, category, is_positive, sets_lead_status, follow_up_hours, sort_order)
  values
    (new.id, 'meeting_booked', 'Møde booket',        'meeting',        true,  'meeting_booked', null, 10),
    (new.id, 'interested',     'Interesseret',       'connected',      true,  'qualified',      72,   20),
    (new.id, 'callback',       'Ring igen',          'callback',       false, 'attempting',     24,   30),
    (new.id, 'not_interested', 'Ikke interesseret',  'not_interested', false, 'lost',           null, 40),
    (new.id, 'no_answer',      'Intet svar',         'no_answer',      false, 'attempting',     4,    50),
    (new.id, 'voicemail',      'Telefonsvarer',      'no_answer',      false, 'attempting',     24,   60),
    (new.id, 'gatekeeper',     'Stoppet i receptionen', 'no_answer',   false, 'attempting',     24,   70),
    (new.id, 'wrong_number',   'Forkert nummer',     'wrong_number',   false, null,             null, 80),
    (new.id, 'do_not_call',    'Må ikke kontaktes',  'dnc',            false, 'dnc',            null, 90);
  return new;
end;
$$;

create or replace trigger organizations_seed_dispositions after insert on public.organizations
  for each row execute function public.seed_default_dispositions();

-- Ny bruger i auth.users får en organisation og en profil.
-- Inviterede brugere sender org_id med i metadata og lander i den eksisterende
-- organisation som 'agent'; alle andre opretter deres egen og bliver 'owner'.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_org uuid;
  invited_org uuid;
  new_role public.user_role;
begin
  invited_org := nullif(new.raw_user_meta_data ->> 'org_id', '')::uuid;

  if invited_org is not null then
    target_org := invited_org;
    new_role := 'agent';
  else
    insert into public.organizations (name)
    values (coalesce(nullif(new.raw_user_meta_data ->> 'org_name', ''), 'Min organisation'))
    returning id into target_org;
    new_role := 'owner';
  end if;

  insert into public.profiles (id, org_id, email, full_name, role)
  values (
    new.id,
    target_org,
    new.email,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    new_role
  );

  return new;
end;
$$;

create or replace trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.organizations   enable row level security;
alter table public.profiles        enable row level security;
alter table public.lead_lists      enable row level security;
alter table public.leads           enable row level security;
alter table public.dispositions    enable row level security;
alter table public.dialer_sessions enable row level security;
alter table public.calls           enable row level security;
alter table public.call_events     enable row level security;
alter table public.recordings      enable row level security;
alter table public.transcripts     enable row level security;
alter table public.call_ai_analysis enable row level security;
alter table public.activities      enable row level security;
alter table public.tasks           enable row level security;
alter table public.meetings        enable row level security;

-- Organisationen: alle medlemmer kan se den, kun owner/admin kan rette den.
drop policy if exists organizations_select on public.organizations;
create policy organizations_select on public.organizations
  for select using (id = public.current_org_id());
drop policy if exists organizations_update on public.organizations;
create policy organizations_update on public.organizations
  for update using (
    id = public.current_org_id()
    and public.current_user_role() in ('owner', 'admin')
  );

-- Profiler: alle i organisationen kan ses, men man retter kun sin egen
-- (owner/admin kan rette alle i organisationen).
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (org_id = public.current_org_id());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update using (
    id = auth.uid()
    or (org_id = public.current_org_id() and public.current_user_role() in ('owner', 'admin'))
  );

-- Resten af tabellerne deler samme mønster: fuld adgang inden for egen
-- organisation, ingen adgang på tværs.
do $$
declare
  t text;
begin
  foreach t in array array[
    'lead_lists', 'leads', 'dispositions', 'dialer_sessions', 'calls',
    'call_events', 'recordings', 'transcripts', 'call_ai_analysis',
    'activities', 'tasks', 'meetings'
  ]
  loop
    -- Politikkerne lægges på igen hver gang, så filen kan køres forfra.
    execute format(
      'drop policy if exists %1$s_select on public.%1$s', t
    );
    execute format(
      'create policy %1$s_select on public.%1$s for select using (org_id = public.current_org_id())', t
    );
    execute format(
      'drop policy if exists %1$s_insert on public.%1$s', t
    );
    execute format(
      'create policy %1$s_insert on public.%1$s for insert with check (org_id = public.current_org_id())', t
    );
    execute format(
      'drop policy if exists %1$s_update on public.%1$s', t
    );
    execute format(
      'create policy %1$s_update on public.%1$s for update using (org_id = public.current_org_id()) with check (org_id = public.current_org_id())', t
    );
    execute format(
      'drop policy if exists %1$s_delete on public.%1$s', t
    );
    execute format(
      'create policy %1$s_delete on public.%1$s for delete using (org_id = public.current_org_id())', t
    );
  end loop;
end;
$$;
