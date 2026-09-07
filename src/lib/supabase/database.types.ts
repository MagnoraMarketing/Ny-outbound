/**
 * Typer for databaseskemaet i supabase/migrations.
 *
 * Skrevet i hånden fordi `supabase gen types` kræver Docker. Holdes i sync
 * med migrationerne manuelt - ret altid begge steder.
 *
 * Bemærk: alt herunder er type-aliaser, ikke interfaces. Interfaces får ikke
 * implicit index signature, og så opløser supabase-js' query-parser hver
 * række til `never`. Skriv derfor `type X = {}` og ikke `interface X {}`.
 */

export type UserRole = 'owner' | 'admin' | 'agent';

export type LeadStatus =
  | 'new'
  | 'attempting'
  | 'contacted'
  | 'qualified'
  | 'meeting_booked'
  | 'won'
  | 'lost'
  | 'dnc';

export type CallDirection = 'outbound' | 'inbound';

export type CallStatus =
  | 'queued'
  | 'initiated'
  | 'ringing'
  | 'answered'
  | 'completed'
  | 'busy'
  | 'no_answer'
  | 'failed'
  | 'canceled'
  | 'voicemail';

export type DispositionCategory =
  | 'connected'
  | 'no_answer'
  | 'not_interested'
  | 'meeting'
  | 'callback'
  | 'dnc'
  | 'wrong_number';

export type DialerMode = 'manual' | 'power' | 'parallel';

export type DialerSessionStatus = 'active' | 'paused' | 'ended';

export type TaskStatus = 'open' | 'done' | 'canceled';

export type ActivityType =
  | 'call'
  | 'note'
  | 'status_change'
  | 'email'
  | 'meeting'
  | 'import'
  | 'ai_analysis';

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type Organization = {
  id: string;
  name: string;
  default_caller_id: string | null;
  telnyx_connection_id: string | null;
  created_at: string;
  updated_at: string;
}

export type Profile = {
  id: string;
  org_id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  caller_id: string | null;
  created_at: string;
  updated_at: string;
}

export type LeadList = {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  source: string | null;
  created_by: string | null;
  created_at: string;
}

export type Lead = {
  id: string;
  org_id: string;
  list_id: string | null;
  owner_id: string | null;
  company_name: string;
  cvr: string | null;
  contact_name: string | null;
  title: string | null;
  phone: string | null;
  mobile: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  industry: string | null;
  employees: number | null;
  status: LeadStatus;
  score: number;
  notes: string | null;
  custom_fields: Record<string, Json>;
  do_not_call: boolean;
  call_attempts: number;
  last_call_at: string | null;
  next_follow_up_at: string | null;
  created_at: string;
  updated_at: string;
}

export type Disposition = {
  id: string;
  org_id: string;
  code: string;
  name: string;
  category: DispositionCategory;
  is_positive: boolean;
  sets_lead_status: LeadStatus | null;
  follow_up_hours: number | null;
  sort_order: number;
  active: boolean;
  created_at: string;
}

export type DialerSession = {
  id: string;
  org_id: string;
  user_id: string;
  list_id: string | null;
  mode: DialerMode;
  lines: number;
  status: DialerSessionStatus;
  /** Telnyx-benet agenten sidder på, sat når parallel-sessionen kobles op. */
  agent_call_control_id: string | null;
  calls_made: number;
  calls_connected: number;
  meetings_booked: number;
  talk_seconds: number;
  started_at: string;
  ended_at: string | null;
}

export type Call = {
  id: string;
  org_id: string;
  lead_id: string | null;
  user_id: string | null;
  session_id: string | null;
  disposition_id: string | null;
  direction: CallDirection;
  status: CallStatus;
  /** Sandt for agentens eget ben i en parallel-session. */
  is_agent_leg: boolean;
  telnyx_call_control_id: string | null;
  telnyx_call_session_id: string | null;
  telnyx_call_leg_id: string | null;
  from_number: string | null;
  to_number: string | null;
  started_at: string | null;
  answered_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  talk_seconds: number | null;
  hangup_cause: string | null;
  disposition_note: string | null;
  created_at: string;
  updated_at: string;
}

export type CallEvent = {
  id: string;
  org_id: string | null;
  call_id: string | null;
  event_type: string;
  telnyx_event_id: string | null;
  payload: Json;
  created_at: string;
}

export type Recording = {
  id: string;
  org_id: string;
  call_id: string;
  telnyx_recording_id: string | null;
  url: string;
  format: string;
  channels: string;
  duration_seconds: number | null;
  size_bytes: number | null;
  created_at: string;
}

export type TranscriptSegment = {
  speaker: string;
  start: number;
  end: number;
  text: string;
}

export type Transcript = {
  id: string;
  org_id: string;
  call_id: string;
  recording_id: string | null;
  provider: string;
  language: string;
  text: string;
  segments: TranscriptSegment[];
  created_at: string;
}

export type Objection = {
  type: string;
  quote: string;
  handled: boolean;
}

export type Coaching = {
  styrker?: string[];
  forbedringer?: string[];
}

export type CallAiAnalysis = {
  id: string;
  org_id: string;
  call_id: string;
  summary: string;
  sentiment: string | null;
  outcome: string | null;
  objections: Objection[];
  buying_signals: string[];
  next_action: string | null;
  suggested_disposition_code: string | null;
  suggested_follow_up_at: string | null;
  coaching: Coaching;
  lead_score: number | null;
  model: string;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: string;
}

export type Activity = {
  id: string;
  org_id: string;
  lead_id: string | null;
  call_id: string | null;
  user_id: string | null;
  type: ActivityType;
  title: string;
  body: string | null;
  metadata: Record<string, Json>;
  created_at: string;
}

export type TaskRow = {
  id: string;
  org_id: string;
  lead_id: string | null;
  assigned_to: string | null;
  call_id: string | null;
  title: string;
  description: string | null;
  due_at: string;
  status: TaskStatus;
  source: string;
  created_at: string;
  completed_at: string | null;
}

export type Meeting = {
  id: string;
  org_id: string;
  lead_id: string;
  booked_by: string | null;
  call_id: string | null;
  title: string;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  notes: string | null;
  outcome: string | null;
  created_at: string;
}


/** Rækker der indsættes: databasen udfylder selv id, tidsstempler og defaults. */
type Insertable<T, Optional extends keyof T> = Omit<T, 'id' | 'created_at' | Optional> &
  Partial<Pick<T, Optional>> & { id?: string };

/**
 * Fremmednøgle beskrevet på den form supabase-js bruger til at typebestemme
 * indlejrede selects som `leads(company_name)`.
 */
type Rel<
  Name extends string,
  Column extends string,
  Referenced extends string,
  ReferencedColumn extends string = 'id',
> = {
  foreignKeyName: Name;
  columns: [Column];
  isOneToOne: false;
  referencedRelation: Referenced;
  referencedColumns: [ReferencedColumn];
};

type OrgRel<T extends string> = Rel<`${T}_org_id_fkey`, 'org_id', 'organizations'>;

type TableDef<Row, Insert, Update, Relationships extends readonly unknown[]> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: Relationships;
}

export type Database = {
  public: {
    Tables: {
      organizations: TableDef<
        Organization,
        Insertable<Organization, 'default_caller_id' | 'telnyx_connection_id' | 'updated_at'>,
        Partial<Organization>,
        []
      >;
      profiles: TableDef<Profile, Profile, Partial<Profile>, [OrgRel<'profiles'>]>;
      lead_lists: TableDef<
        LeadList,
        Insertable<LeadList, 'description' | 'source' | 'created_by'>,
        Partial<LeadList>,
        [OrgRel<'lead_lists'>, Rel<'lead_lists_created_by_fkey', 'created_by', 'profiles'>]
      >;
      leads: TableDef<
        Lead,
        Insertable<
          Lead,
          | 'list_id' | 'owner_id' | 'cvr' | 'contact_name' | 'title' | 'phone' | 'mobile'
          | 'email' | 'website' | 'address' | 'postal_code' | 'city' | 'industry'
          | 'employees' | 'status' | 'score' | 'notes' | 'custom_fields' | 'do_not_call'
          | 'call_attempts' | 'last_call_at' | 'next_follow_up_at' | 'updated_at'
        >,
        Partial<Lead>,
        [
          OrgRel<'leads'>,
          Rel<'leads_list_id_fkey', 'list_id', 'lead_lists'>,
          Rel<'leads_owner_id_fkey', 'owner_id', 'profiles'>,
        ]
      >;
      dispositions: TableDef<
        Disposition,
        Disposition,
        Partial<Disposition>,
        [OrgRel<'dispositions'>]
      >;
      dialer_sessions: TableDef<
        DialerSession,
        Insertable<
          DialerSession,
          | 'list_id' | 'mode' | 'lines' | 'status' | 'agent_call_control_id'
          | 'calls_made' | 'calls_connected' | 'meetings_booked' | 'talk_seconds'
          | 'started_at' | 'ended_at'
        >,
        Partial<DialerSession>,
        [
          OrgRel<'dialer_sessions'>,
          Rel<'dialer_sessions_user_id_fkey', 'user_id', 'profiles'>,
          Rel<'dialer_sessions_list_id_fkey', 'list_id', 'lead_lists'>,
        ]
      >;
      calls: TableDef<
        Call,
        Insertable<
          Call,
          | 'lead_id' | 'user_id' | 'session_id' | 'disposition_id' | 'direction' | 'status'
          | 'is_agent_leg' | 'telnyx_call_control_id' | 'telnyx_call_session_id' | 'telnyx_call_leg_id'
          | 'from_number' | 'to_number' | 'started_at' | 'answered_at' | 'ended_at'
          | 'duration_seconds' | 'talk_seconds' | 'hangup_cause' | 'disposition_note'
          | 'updated_at'
        >,
        Partial<Call>,
        [
          OrgRel<'calls'>,
          Rel<'calls_lead_id_fkey', 'lead_id', 'leads'>,
          Rel<'calls_user_id_fkey', 'user_id', 'profiles'>,
          Rel<'calls_session_id_fkey', 'session_id', 'dialer_sessions'>,
          Rel<'calls_disposition_id_fkey', 'disposition_id', 'dispositions'>,
        ]
      >;
      call_events: TableDef<
        CallEvent,
        Insertable<CallEvent, 'org_id' | 'call_id' | 'telnyx_event_id'>,
        Partial<CallEvent>,
        [OrgRel<'call_events'>, Rel<'call_events_call_id_fkey', 'call_id', 'calls'>]
      >;
      recordings: TableDef<
        Recording,
        Insertable<
          Recording,
          'telnyx_recording_id' | 'format' | 'channels' | 'duration_seconds' | 'size_bytes'
        >,
        Partial<Recording>,
        [OrgRel<'recordings'>, Rel<'recordings_call_id_fkey', 'call_id', 'calls'>]
      >;
      transcripts: TableDef<
        Transcript,
        Insertable<Transcript, 'recording_id' | 'provider' | 'language' | 'segments'>,
        Partial<Transcript>,
        [
          OrgRel<'transcripts'>,
          Rel<'transcripts_call_id_fkey', 'call_id', 'calls'>,
          Rel<'transcripts_recording_id_fkey', 'recording_id', 'recordings'>,
        ]
      >;
      call_ai_analysis: TableDef<
        CallAiAnalysis,
        Insertable<
          CallAiAnalysis,
          | 'sentiment' | 'outcome' | 'objections' | 'buying_signals' | 'next_action'
          | 'suggested_disposition_code' | 'suggested_follow_up_at' | 'coaching'
          | 'lead_score' | 'input_tokens' | 'output_tokens'
        >,
        Partial<CallAiAnalysis>,
        [OrgRel<'call_ai_analysis'>, Rel<'call_ai_analysis_call_id_fkey', 'call_id', 'calls'>]
      >;
      activities: TableDef<
        Activity,
        Insertable<Activity, 'lead_id' | 'call_id' | 'user_id' | 'body' | 'metadata'>,
        Partial<Activity>,
        [
          OrgRel<'activities'>,
          Rel<'activities_lead_id_fkey', 'lead_id', 'leads'>,
          Rel<'activities_call_id_fkey', 'call_id', 'calls'>,
          Rel<'activities_user_id_fkey', 'user_id', 'profiles'>,
        ]
      >;
      tasks: TableDef<
        TaskRow,
        Insertable<
          TaskRow,
          | 'lead_id' | 'assigned_to' | 'call_id' | 'description' | 'status' | 'source'
          | 'completed_at'
        >,
        Partial<TaskRow>,
        [
          OrgRel<'tasks'>,
          Rel<'tasks_lead_id_fkey', 'lead_id', 'leads'>,
          Rel<'tasks_assigned_to_fkey', 'assigned_to', 'profiles'>,
          Rel<'tasks_call_id_fkey', 'call_id', 'calls'>,
        ]
      >;
      meetings: TableDef<
        Meeting,
        Insertable<
          Meeting,
          'booked_by' | 'call_id' | 'ends_at' | 'location' | 'notes' | 'outcome'
        >,
        Partial<Meeting>,
        [
          OrgRel<'meetings'>,
          Rel<'meetings_lead_id_fkey', 'lead_id', 'leads'>,
          Rel<'meetings_booked_by_fkey', 'booked_by', 'profiles'>,
          Rel<'meetings_call_id_fkey', 'call_id', 'calls'>,
        ]
      >;
    };
    // Tom mapped type, ikke Record<string, never>: supabase-js danner
    // `Tables & Views`, og en index signature ville gøre hver tabel til never.
    Views: { [_ in never]: never };
    Functions: {
      current_org_id: { Args: Record<string, never>; Returns: string };
      current_user_role: { Args: Record<string, never>; Returns: UserRole };
    };
    Enums: {
      user_role: UserRole;
      lead_status: LeadStatus;
      call_direction: CallDirection;
      call_status: CallStatus;
      disposition_category: DispositionCategory;
      dialer_mode: DialerMode;
      dialer_session_status: DialerSessionStatus;
      task_status: TaskStatus;
      activity_type: ActivityType;
    };
    CompositeTypes: { [_ in never]: never };
  };
}
