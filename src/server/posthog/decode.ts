import { gunzipSync } from 'zlib';
import { PostHogRequestError } from './lib/errors';

export const POSTHOG_BODY_LIMIT = 20 * 1024 * 1024;

interface DecodeHints {
  compression?: string | null;
  contentEncoding?: string | null;
  contentType?: string | null;
}

export function decodeBody(bytes: Uint8Array, hints: DecodeHints = {}) {
  if (bytes.byteLength > POSTHOG_BODY_LIMIT) {
    throw new PostHogRequestError('maximum event size exceeded', 413);
  }

  let compression = (hints.compression || '').toLowerCase();
  let data: Buffer = Buffer.from(bytes);
  const contentType = hints.contentType || '';

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const params = new URLSearchParams(data.toString('utf8'));
    const field = params.get('data');

    if (!field) {
      throw new PostHogRequestError('request missing data payload', 400);
    }

    if (!compression && params.get('compression')) {
      compression = params.get('compression').toLowerCase();
    }

    data = Buffer.from(field, 'utf8');
  }

  if (compression === 'lz64' || compression === 'lz-string') {
    throw new PostHogRequestError('unsupported compression', 400);
  }

  if (compression === 'base64' || compression === 'b64') {
    data = Buffer.from(data.toString('utf8'), 'base64');
  }

  const forcedGzip =
    (hints.contentEncoding || '').toLowerCase().includes('gzip') ||
    compression === 'gzip' ||
    compression === 'gzip-js';

  data = maybeGunzip(data, forcedGzip);

  const text = data.toString('utf8').trim();

  if (!text) {
    throw new PostHogRequestError('request missing data payload', 400);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new PostHogRequestError('failed to parse request', 400);
  }
}

function maybeGunzip(data: Buffer, forced: boolean): Buffer {
  let current = data;

  if (!looksLikeGzip(current)) {
    const asText = current.toString('utf8').trim();

    if (asText && !asText.startsWith('{') && !asText.startsWith('[')) {
      const decoded = Buffer.from(asText, 'base64');

      if (looksLikeGzip(decoded)) {
        current = decoded;
      }
    }
  }

  if (looksLikeGzip(current)) {
    try {
      return gunzipSync(current, { maxOutputLength: POSTHOG_BODY_LIMIT });
    } catch (error: any) {
      if (error?.code === 'ERR_BUFFER_TOO_LARGE') {
        throw new PostHogRequestError('maximum event size exceeded', 413);
      }

      throw new PostHogRequestError('failed to decode request', 400);
    }
  }

  const text = data.toString('utf8').trim();

  if (forced && !text.startsWith('{') && !text.startsWith('[')) {
    throw new PostHogRequestError('failed to decode request', 400);
  }

  return data;
}

function looksLikeGzip(data: Buffer) {
  return data.length >= 2 && data[0] === 0x1f && data[1] === 0x8b;
}
