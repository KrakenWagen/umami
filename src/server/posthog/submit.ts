import { IP_ADDRESS_HEADERS } from '@/lib/constants';
import { collect } from '@/server/collect';
import { collectSchema, type CollectInput } from '@/server/collect-schema';
import { PostHogRequestError } from './lib/errors';

const LOCATION_HEADERS = [
  'cf-ipcountry',
  'cf-region-code',
  'cf-ipcity',
  'x-vercel-ip-country',
  'x-vercel-ip-country-region',
  'x-vercel-ip-city',
];

export type SubmitResult =
  | { status: 'ok' }
  | { status: 'rejected'; httpStatus: 400 | 403; message?: string };

// Validates every body, then writes. A failure after the first stored event
// is retryable. The collector assigns a new event id, so a retry can duplicate.
export async function submitBodies(
  bodies: CollectInput[],
  headers: Headers,
): Promise<SubmitResult> {
  const parsedBodies = bodies.map(body => {
    const parsed = collectSchema.safeParse(body);

    if (!parsed.success) {
      throw new Error('PostHog event could not be stored');
    }

    return parsed.data;
  });

  const request = collectorRequest(headers);
  let stored = 0;
  // Same distinct id: the collector skips the website lookup and session insert.
  const sessionCache = new Map<string, string>();

  for (const body of parsedBodies) {
    const sessionKey = body.payload.id ?? '';
    const cache = sessionCache.get(sessionKey);

    if (cache) {
      request.headers.set('x-umami-cache', cache);
    } else {
      request.headers.delete('x-umami-cache');
    }

    let outcome;

    try {
      outcome = await collect(body, request);
    } catch (error) {
      if (stored > 0) {
        throw new PostHogRequestError('transient error, please retry', 503);
      }

      throw error;
    }

    if (outcome.status === 'stored') {
      stored += 1;
      sessionCache.set(sessionKey, outcome.body.cache);
      continue;
    }

    if (outcome.status === 'bot') {
      continue;
    }

    if (stored > 0) {
      throw new PostHogRequestError('transient error, please retry', 503);
    }

    return {
      status: 'rejected',
      httpStatus: outcome.httpStatus,
      ...(outcome.httpStatus === 400 && { message: outcome.message }),
    };
  }

  return { status: 'ok' };
}

function collectorRequest(headers: Headers) {
  return new Request('http://localhost/api/send', {
    method: 'POST',
    headers: forwardedHeaders(headers),
  });
}

function forwardedHeaders(headers: Headers) {
  const names = ['user-agent', ...LOCATION_HEADERS, ...IP_ADDRESS_HEADERS];

  if (process.env.CLIENT_IP_HEADER) {
    names.push(process.env.CLIENT_IP_HEADER);
  }

  const next = new Headers();

  for (const name of names) {
    const value = headers.get(name);

    if (value) {
      next.set(name, value);
    }
  }

  return next;
}
