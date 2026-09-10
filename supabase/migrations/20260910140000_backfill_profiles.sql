-- Giver en allerede oprettet bruger sin organisation og profil.
--
-- on_auth_user_created kører "after insert on auth.users", så den fyrer kun
-- når en bruger oprettes. Har man skrevet sig op før skemaet blev lagt på,
-- står man tilbage med en række i auth.users og ingen profil - og appen
-- sender én til opsætningssiden ved hvert login uden at sige hvorfor. Det
-- ligner at skemaet ikke virkede.
--
-- Her får hver bruger uden profil det samme som triggeren ville have givet
-- dem: en organisation, en profil som owner, og gennem
-- organizations_seed_dispositions et sæt standarddispositioner.
--
-- Kører hver gang skemaet lægges på, og gør intet når alle har en profil.

do $$
declare
  waiting record;
  target_org uuid;
begin
  for waiting in
    select u.id, u.email, u.raw_user_meta_data
    from auth.users u
    left join public.profiles p on p.id = u.id
    where p.id is null
    order by u.created_at
  loop
    -- Er brugeren inviteret til en organisation der findes, bruges den.
    -- Ellers får de deres egen, præcis som ved en almindelig oprettelse.
    select o.id into target_org
    from public.organizations o
    where o.id = nullif(waiting.raw_user_meta_data ->> 'org_id', '')::uuid;

    if target_org is null then
      insert into public.organizations (name)
      values (
        coalesce(nullif(waiting.raw_user_meta_data ->> 'org_name', ''), 'Min organisation')
      )
      returning id into target_org;
    end if;

    insert into public.profiles (id, org_id, email, full_name, role)
    values (
      waiting.id,
      target_org,
      waiting.email,
      nullif(waiting.raw_user_meta_data ->> 'full_name', ''),
      case
        when nullif(waiting.raw_user_meta_data ->> 'org_id', '') is null then 'owner'
        else 'agent'
      end::public.user_role
    );
  end loop;
end;
$$;
