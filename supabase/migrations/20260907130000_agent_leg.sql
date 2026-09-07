-- Agentens eget ben i en parallel-session.
--
-- I parallel-mode ringer serveren ud på flere linjer samtidig. Når det første
-- lead tager telefonen, skal det kobles sammen med agenten - og så skal vi
-- vide hvilket Telnyx-ben agenten sidder på.

alter table public.dialer_sessions
  add column agent_call_control_id text;

-- Webhooken slår sessionen op ud fra agentens ben, så det skal være hurtigt.
create index dialer_sessions_agent_leg_idx
  on public.dialer_sessions (agent_call_control_id)
  where agent_call_control_id is not null;

-- Markerer at et ben er agentens, så webhooken ikke forveksler det med et lead.
alter table public.calls
  add column is_agent_leg boolean not null default false;
