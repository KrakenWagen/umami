import { z } from 'zod';
import { PostHogRequestError } from './lib/errors';
import { type CaptureKind } from './lib/paths';
import { IGNORED_EVENTS, IDENTIFY_EVENT, POSTHOG_DISTINCT_ID_LENGTH } from './lib/policy';

const uuidSchema = z.string().uuid();

export interface CaptureEvent {
  name: string;
  distinctId: string;
  properties: Record<string, any>;
  occurredAt?: Date;
  set?: Record<string, any>;
  setOnce?: Record<string, any>;
}

export interface CaptureBatch {
  token: string;
  events: CaptureEvent[];
}

interface ParseOptions {
  kind: CaptureKind;
  querySentAt?: string | null;
  now?: Date;
}

export function parseCapture(payload: unknown, options: ParseOptions): CaptureBatch {
  const extracted = extractEvents(payload);
  const now = options.now ?? new Date();
  const batchSentAt = sentAtFromIso(extracted.sentAt) || sentAtFromQuery(options.querySentAt);
  const normalized = extracted.events.map(event => normalizeEvent(event, options.kind));
  const token = resolveToken(extracted.token, normalized);
  const events = normalized
    .filter(event => !IGNORED_EVENTS.has(event.name))
    .map(event => ({
      name: event.name,
      distinctId: event.distinctId,
      properties: event.properties,
      occurredAt: occurredAt(event, batchSentAt, now),
      set: event.set,
      setOnce: event.setOnce,
    }));

  return { token, events };
}

interface RawEvent {
  name: string;
  distinctId: string;
  token?: string;
  properties: Record<string, any>;
  timestamp?: unknown;
  offset?: unknown;
  sentAt?: unknown;
  set?: Record<string, any>;
  setOnce?: Record<string, any>;
}

function extractEvents(payload: unknown): { token?: string; sentAt?: unknown; events: unknown[] } {
  if (Array.isArray(payload)) {
    if (!payload.length) {
      throw new PostHogRequestError('request holds no event', 400);
    }

    return { events: payload };
  }

  if (!isPlainObject(payload)) {
    throw new PostHogRequestError('failed to parse request', 400);
  }

  if (Array.isArray(payload.batch)) {
    if (!payload.batch.length) {
      throw new PostHogRequestError('request holds no event', 400);
    }

    return {
      token: firstString(payload.api_key, payload.token),
      sentAt: payload.sent_at,
      events: payload.batch,
    };
  }

  return {
    token: firstString(payload.api_key, payload.token, payload.$token),
    sentAt: payload.sent_at,
    events: [payload],
  };
}

function normalizeEvent(raw: unknown, kind: CaptureKind): RawEvent {
  if (!isPlainObject(raw)) {
    throw new PostHogRequestError('failed to parse request', 400);
  }

  const properties = isPlainObject(raw.properties) ? raw.properties : {};
  let name = asNonEmptyString(raw.event);

  if (!name) {
    if (kind === 'engage') {
      name = IDENTIFY_EVENT;
    } else {
      throw new PostHogRequestError('event submitted with an empty event name', 400);
    }
  }

  const distinctId = asDistinctId(
    raw.distinct_id ?? raw.$distinct_id ?? properties.distinct_id ?? properties.$distinct_id,
  );

  if (!distinctId) {
    throw new PostHogRequestError('event submitted without a distinct_id', 400);
  }

  return {
    name,
    distinctId: distinctId.slice(0, POSTHOG_DISTINCT_ID_LENGTH),
    token: firstString(raw.api_key, raw.token, raw.$token, properties.token, properties.$token),
    properties,
    timestamp: raw.timestamp,
    offset: raw.offset,
    sentAt: raw.sent_at,
    set: plainObject(raw.$set) || plainObject(properties.$set),
    setOnce: plainObject(raw.$set_once) || plainObject(properties.$set_once),
  };
}

function resolveToken(batchToken: string | undefined, events: RawEvent[]) {
  let token = batchToken;

  for (const event of events) {
    if (!event.token) {
      continue;
    }

    if (token && token !== event.token) {
      throw new PostHogRequestError('batch submitted with inconsistent api_key values', 401);
    }

    token = event.token;
  }

  if (!token) {
    throw new PostHogRequestError('event submitted without an api_key', 401);
  }

  if (!uuidSchema.safeParse(token).success) {
    throw new PostHogRequestError('API key is not valid', 401);
  }

  return token;
}

function occurredAt(event: RawEvent, batchSentAt: Date | undefined, now: Date) {
  if (event.timestamp == null || event.timestamp === '') {
    return undefined;
  }

  let timestamp = parseEventTimestamp(event.timestamp);
  const offset = typeof event.offset === 'number' ? event.offset : Number(event.offset);

  if (Number.isFinite(offset) && event.offset != null && event.offset !== '') {
    timestamp = new Date(timestamp.getTime() - offset);
  }

  const sentAt = sentAtFromIso(event.sentAt) || batchSentAt;
  const ignoreSentAt = event.properties.$ignore_sent_at === true;

  if (sentAt && !ignoreSentAt) {
    timestamp = new Date(timestamp.getTime() + (now.getTime() - sentAt.getTime()));
  }

  if (Number.isNaN(timestamp.getTime())) {
    throw new PostHogRequestError('event submitted with invalid timestamp', 400);
  }

  return timestamp;
}

function parseEventTimestamp(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return dateFromUnix(value);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      return dateFromUnix(Number(trimmed));
    }

    const parsed = new Date(trimmed);

    if (Number.isNaN(parsed.getTime())) {
      throw new PostHogRequestError('event submitted with invalid timestamp', 400);
    }

    return parsed;
  }

  throw new PostHogRequestError('event submitted with invalid timestamp', 400);
}

function dateFromUnix(value: number) {
  const milliseconds = Math.abs(value) > 1e12 ? value : value * 1000;
  const parsed = new Date(milliseconds);

  if (Number.isNaN(parsed.getTime())) {
    throw new PostHogRequestError('event submitted with invalid timestamp', 400);
  }

  return parsed;
}

function sentAtFromIso(value: unknown) {
  if (typeof value !== 'string' || !value) {
    return undefined;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return parsed;
}

function sentAtFromQuery(value: string | null | undefined) {
  if (!value) {
    return undefined;
  }

  const milliseconds = Number(value);

  if (!Number.isFinite(milliseconds)) {
    return undefined;
  }

  const parsed = new Date(milliseconds);

  if (Number.isNaN(parsed.getTime()) || parsed.getUTCFullYear() <= 2020) {
    return undefined;
  }

  return parsed;
}

function asDistinctId(value: unknown) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || undefined;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === 'boolean') {
    return String(value);
  }

  return undefined;
}

function asNonEmptyString(value: unknown) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const parsed = asNonEmptyString(value);

    if (parsed) {
      return parsed;
    }
  }

  return undefined;
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function plainObject(value: unknown) {
  return isPlainObject(value) ? value : undefined;
}
