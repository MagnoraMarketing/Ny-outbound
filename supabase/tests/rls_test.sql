-- Tester at multi-tenant isolationen holder: to organisationer må aldrig
-- kunne se hinandens data, og signup-triggeren skal sætte alt korrekt op.
\set ON_ERROR_STOP on

-- To brugere melder sig til; triggeren opretter en organisation pr. bruger.
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'a@firma-a.dk',
   '{"org_name": "Firma A", "full_name": "Anna Andersen"}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', 'b@firma-b.dk',
   '{"org_name": "Firma B", "full_name": "Bo Berg"}'::jsonb);

do $$
declare
  n int;
begin
  select count(*) into n from public.organizations;
  assert n = 2, format('forventede 2 organisationer, fik %s', n);

  select count(*) into n from public.profiles where role = 'owner';
  assert n = 2, format('forventede 2 owners, fik %s', n);

  -- Hver organisation skal have fået standarddispositionerne
  select count(*) into n from public.dispositions;
  assert n = 18, format('forventede 18 dispositioner (9 pr. org), fik %s', n);
end;
$$;

-- En inviteret bruger skal lande i den eksisterende organisation som agent.
insert into auth.users (id, email, raw_user_meta_data)
select '33333333-3333-3333-3333-333333333333', 'c@firma-a.dk',
       jsonb_build_object('org_id', o.id::text, 'full_name', 'Carl Clausen')
from public.organizations o where o.name = 'Firma A';

do $$
declare
  r record;
begin
  select p.role, o.name into r
  from public.profiles p join public.organizations o on o.id = p.org_id
  where p.id = '33333333-3333-3333-3333-333333333333';
  assert r.role = 'agent', format('inviteret bruger fik rollen %s', r.role);
  assert r.name = 'Firma A', format('inviteret bruger havnede i %s', r.name);
end;
$$;

-- Fra nu af testes som almindelig, RLS-underlagt bruger.
grant usage on schema public to authenticated;
grant all on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- Anna (Firma A) opretter et lead.
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

insert into public.leads (org_id, company_name, phone, contact_name)
select public.current_org_id(), 'Kunde ApS', '+4512345678', 'Kim Kunde';

do $$
declare
  n int;
begin
  select count(*) into n from public.leads;
  assert n = 1, format('Anna skulle se 1 lead, så %s', n);

  select count(*) into n from public.dispositions;
  assert n = 9, format('Anna skulle se 9 dispositioner, så %s', n);

  select count(*) into n from public.organizations;
  assert n = 1, format('Anna skulle se 1 organisation, så %s', n);
end;
$$;

-- Bo (Firma B) må ikke kunne se noget af det.
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

do $$
declare
  n int;
begin
  select count(*) into n from public.leads;
  assert n = 0, format('Bo måtte ikke se Annas leads, men så %s', n);

  select count(*) into n from public.profiles;
  assert n = 1, format('Bo skulle kun se sin egen profil, så %s', n);
end;
$$;

-- Bo må heller ikke kunne skrive data ind i Firma A's organisation.
do $$
declare
  firma_a uuid;
  fejlede boolean := false;
begin
  set local role postgres;
  select id into firma_a from public.organizations where name = 'Firma A';
  set local role authenticated;

  begin
    insert into public.leads (org_id, company_name, phone)
    values (firma_a, 'Kapret ApS', '+4599999999');
  exception when insufficient_privilege then
    fejlede := true;
  end;

  assert fejlede, 'Bo kunne skrive et lead ind i Firma A - RLS holder ikke';
end;
$$;

-- Carl er agent i Firma A og skal se Annas lead.
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';

do $$
declare
  n int;
begin
  select count(*) into n from public.leads;
  assert n = 1, format('Carl skulle se organisationens lead, så %s', n);

  select count(*) into n from public.profiles;
  assert n = 2, format('Carl skulle se 2 kolleger, så %s', n);
end;
$$;

reset role;
select 'ALLE RLS-TESTS BESTÅET' as resultat;
