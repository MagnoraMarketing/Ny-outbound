import 'server-only';

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

import { env } from '@/lib/env';
import { callAnalysisSchema, type CallAnalysis } from './schema';
import { buildUserPrompt, SYSTEM_PROMPT, type AnalysisContext } from './prompt';

export const ANALYSIS_MODEL = 'claude-opus-5';

/** Under så mange tegn er der ikke nok samtale til en meningsfuld analyse. */
export const MIN_TRANSCRIPT_LENGTH = 120;

export interface AnalysisOutcome {
  analysis: CallAnalysis;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
}

export class AnalysisError extends Error {}

/**
 * Lader Claude vurdere et opkald ud fra udskriften.
 *
 * Svaret valideres mod callAnalysisSchema, så resten af systemet altid får
 * felterne i den form det regner med - ikke fritekst der skal gættes på.
 */
export async function analyzeCall(context: AnalysisContext): Promise<AnalysisOutcome> {
  if (context.transcript.trim().length < MIN_TRANSCRIPT_LENGTH) {
    throw new AnalysisError(
      'Udskriften er for kort til en analyse. Opkaldet nåede formentlig aldrig at blive en samtale.',
    );
  }

  const client = new Anthropic({ apiKey: env.anthropicApiKey() });

  const response = await client.messages.parse({
    model: ANALYSIS_MODEL,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    thinking: { type: 'adaptive' },
    messages: [{ role: 'user', content: buildUserPrompt(context) }],
    output_config: { format: zodOutputFormat(callAnalysisSchema) },
  });

  if (response.stop_reason === 'refusal') {
    throw new AnalysisError('Analysen blev afvist af sikkerhedsgrunde.');
  }

  if (!response.parsed_output) {
    throw new AnalysisError('Modellen svarede ikke i det forventede format.');
  }

  return {
    analysis: response.parsed_output,
    model: response.model,
    inputTokens: response.usage?.input_tokens ?? null,
    outputTokens: response.usage?.output_tokens ?? null,
  };
}
