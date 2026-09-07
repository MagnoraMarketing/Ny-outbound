/** De felter vi bruger fra en Telnyx Call Control-webhook. */
export interface TelnyxWebhookPayload {
  call_control_id?: string;
  call_leg_id?: string;
  call_session_id?: string;
  client_state?: string | null;
  connection_id?: string;
  from?: string;
  to?: string;
  direction?: string;
  hangup_cause?: string;
  hangup_source?: string;
  start_time?: string;
  end_time?: string;
  /** Sat på call.machine.detection.ended */
  result?: string;
  /** Sat på call.recording.saved */
  recording_urls?: { mp3?: string; wav?: string };
  public_recording_urls?: { mp3?: string; wav?: string };
  recording_id?: string;
  channels?: string;
  /** Sat på call.transcription */
  transcription_data?: {
    transcript?: string;
    confidence?: number;
    is_final?: boolean;
    track?: string;
  };
  [key: string]: unknown;
}

export interface TelnyxWebhookEvent {
  data: {
    id?: string;
    event_type: string;
    occurred_at?: string;
    payload: TelnyxWebhookPayload;
  };
}

export function parseWebhook(body: string): TelnyxWebhookEvent | null {
  try {
    const parsed: unknown = JSON.parse(body);
    const data = (parsed as TelnyxWebhookEvent)?.data;
    if (!data || typeof data.event_type !== 'string' || typeof data.payload !== 'object') {
      return null;
    }
    return parsed as TelnyxWebhookEvent;
  } catch {
    return null;
  }
}

/** Telnyx' hangup-årsager oversat til vores opkaldsstatus. */
export function statusFromHangupCause(cause: string | undefined): 
  | 'completed'
  | 'busy'
  | 'no_answer'
  | 'failed'
  | 'canceled' {
  switch (cause) {
    case 'normal_clearing':
      return 'completed';
    case 'user_busy':
      return 'busy';
    case 'no_answer':
    case 'timeout':
    case 'no_user_response':
      return 'no_answer';
    case 'originator_cancel':
    case 'call_rejected':
      return 'canceled';
    default:
      return 'failed';
  }
}
