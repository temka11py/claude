// AI service layer. The only file that talks to the Anthropic API.
// Everything else in the app works without it; callers check `available`.

import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type * as z4 from 'zod/v4';

export type Effort = 'low' | 'medium' | 'high';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AIProvider {
  readonly available: boolean;
  readonly model: string | null;
  complete(opts: { system: string; messages: ChatMessage[]; maxTokens?: number; effort?: Effort }): Promise<string>;
  stream(opts: { system: string; messages: ChatMessage[]; maxTokens?: number; effort?: Effort }, onText: (delta: string) => void): Promise<string>;
  structured<T>(opts: { system: string; messages: ChatMessage[]; schema: z4.ZodType<T>; maxTokens?: number; effort?: Effort }): Promise<T>;
}

export class AIUnavailableError extends Error {
  constructor(message = 'AI features are not configured. Add ANTHROPIC_API_KEY to your .env file to enable them.') {
    super(message);
  }
}

export class AIRequestError extends Error {
  constructor(
    message: string,
    public retryable: boolean,
  ) {
    super(message);
  }
}

/** Server-side refusal fallbacks: if the model declines, the API retries on a fallback model in the same call. */
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

function toFriendlyError(err: unknown): Error {
  if (err instanceof Anthropic.AuthenticationError) return new AIRequestError('The AI key was rejected. Check ANTHROPIC_API_KEY in your .env file.', false);
  if (err instanceof Anthropic.PermissionDeniedError) return new AIRequestError('This API key does not have access to the configured model.', false);
  if (err instanceof Anthropic.NotFoundError) return new AIRequestError('The configured AI model was not found. Check AI_MODEL in your .env file.', false);
  if (err instanceof Anthropic.RateLimitError) return new AIRequestError('The AI service is busy right now. Please try again in a minute.', true);
  if (err instanceof Anthropic.BadRequestError) return new AIRequestError(`The AI request was rejected: ${err.message}`, false);
  if (err instanceof Anthropic.APIConnectionError) return new AIRequestError('Could not reach the AI service. Check your internet connection.', true);
  if (err instanceof Anthropic.APIError) return new AIRequestError(`AI service error (${err.status ?? 'unknown'}). Please try again.`, true);
  return err instanceof Error ? err : new Error(String(err));
}

function textOf(content: Anthropic.Beta.BetaContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

const REFUSAL_TEXT = "I can't help with that request. Let's get back to your English practice — ask me about a word, a grammar point, or a text you're writing.";

export class AnthropicProvider implements AIProvider {
  readonly available = true;
  private client: Anthropic;

  constructor(
    apiKey: string,
    readonly model: string,
  ) {
    this.client = new Anthropic({ apiKey, maxRetries: 2, timeout: 120_000 });
  }

  private params(opts: { system: string; messages: ChatMessage[]; maxTokens?: number; effort?: Effort }) {
    return {
      model: this.model,
      max_tokens: opts.maxTokens ?? 4000,
      system: opts.system,
      messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
      output_config: { effort: opts.effort ?? 'low' },
      betas: [FALLBACK_BETA],
      fallbacks: 'default' as const,
    };
  }

  async complete(opts: { system: string; messages: ChatMessage[]; maxTokens?: number; effort?: Effort }): Promise<string> {
    try {
      const response = await this.client.beta.messages.create(this.params(opts));
      if (response.stop_reason === 'refusal') return REFUSAL_TEXT;
      return textOf(response.content);
    } catch (err) {
      throw toFriendlyError(err);
    }
  }

  async stream(opts: { system: string; messages: ChatMessage[]; maxTokens?: number; effort?: Effort }, onText: (delta: string) => void): Promise<string> {
    try {
      const stream = this.client.beta.messages.stream(this.params(opts));
      stream.on('text', (delta) => onText(delta));
      const final = await stream.finalMessage();
      if (final.stop_reason === 'refusal') {
        onText(`\n\n${REFUSAL_TEXT}`);
        return REFUSAL_TEXT;
      }
      return textOf(final.content);
    } catch (err) {
      throw toFriendlyError(err);
    }
  }

  async structured<T>(opts: { system: string; messages: ChatMessage[]; schema: z4.ZodType<T>; maxTokens?: number; effort?: Effort }): Promise<T> {
    try {
      const response = await this.client.beta.messages.parse({
        ...this.params({ ...opts, maxTokens: opts.maxTokens ?? 8000, effort: opts.effort ?? 'medium' }),
        output_config: { effort: opts.effort ?? 'medium', format: betaZodOutputFormat(opts.schema) },
      });
      if (response.stop_reason === 'refusal') throw new AIRequestError('The AI could not give feedback on this text.', false);
      if (response.parsed_output === null || response.parsed_output === undefined) {
        throw new AIRequestError('The AI response could not be read. Please try again.', true);
      }
      return response.parsed_output as T;
    } catch (err) {
      throw err instanceof AIRequestError ? err : toFriendlyError(err);
    }
  }
}

/** Used when no API key is configured. Every call fails with a clear message. */
export class UnavailableProvider implements AIProvider {
  readonly available = false;
  readonly model = null;
  async complete(): Promise<string> {
    throw new AIUnavailableError();
  }
  async stream(): Promise<string> {
    throw new AIUnavailableError();
  }
  async structured<T>(): Promise<T> {
    throw new AIUnavailableError();
  }
}

export function createAIProvider(config: { anthropicApiKey: string | null; aiModel: string }): AIProvider {
  return config.anthropicApiKey ? new AnthropicProvider(config.anthropicApiKey, config.aiModel) : new UnavailableProvider();
}
