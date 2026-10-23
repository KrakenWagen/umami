import { forbidden, badRequest, serverError } from '@/lib/response';
import { decodeBody } from './decode';
import { PostHogRequestError } from './lib/errors';
import { captureKind } from './lib/paths';
import { parseCapture } from './protocol';
import { submitBodies } from './submit';
import { translateEvent } from './translate';

export async function handlePostHog(request: Request) {
  const url = new URL(request.url);
  const kind = captureKind(url.pathname);

  if (!kind) {
    return new Response('Not found', { status: 404 });
  }

  const beacon = url.searchParams.get('beacon') === '1';

  try {
    const payload = await readPayload(request, url);
    const batch = parseCapture(payload, {
      kind,
      querySentAt: url.searchParams.get('sent_at') || url.searchParams.get('_'),
    });
    const bodies = batch.events.flatMap(event => translateEvent(event, batch.token));
    const result = await submitBodies(bodies, request.headers);

    if (result.status === 'rejected') {
      if (result.httpStatus === 403) {
        return forbidden();
      }

      return badRequest(result.message);
    }

    if (beacon) {
      return new Response(null, { status: 204 });
    }

    return Response.json({ status: 1 });
  } catch (error) {
    if (error instanceof PostHogRequestError) {
      return new Response(error.message, {
        status: error.status,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    return serverError(error);
  }
}

async function readPayload(request: Request, url: URL) {
  const bytes = new Uint8Array(await request.arrayBuffer());
  const compression = url.searchParams.get('compression');

  if (!bytes.byteLength) {
    const data = url.searchParams.get('data');

    if (!data) {
      throw new PostHogRequestError('request missing data payload', 400);
    }

    return decodeBody(new TextEncoder().encode(data), {
      compression,
      contentType: 'text/plain',
    });
  }

  return decodeBody(bytes, {
    compression,
    contentEncoding: request.headers.get('content-encoding'),
    contentType: request.headers.get('content-type'),
  });
}
