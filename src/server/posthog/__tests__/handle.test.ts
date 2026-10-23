import { expect, jest } from '@jest/globals';
import { collect } from '@/server/collect';
import { handlePostHog } from '../handle';

jest.mock('@/lib/response', () => ({
  badRequest: (message?: string) =>
    Response.json({ error: message ?? 'Bad request' }, { status: 400 }),
  forbidden: () => Response.json({ error: 'Forbidden' }, { status: 403 }),
  serverError: () => Response.json({ error: 'Server error' }, { status: 500 }),
}));

jest.mock('@/server/collect', () => ({
  collect: jest.fn(),
}));

const websiteId = 'af94323e-95b5-4831-90fa-b757b9f32030';
const mockedCollect = collect as jest.MockedFunction<typeof collect>;

function request(pathname: string, payload: unknown, headers?: Record<string, string>) {
  return new Request(`http://localhost${pathname}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(payload),
  });
}

beforeEach(() => {
  mockedCollect.mockReset();
  mockedCollect.mockResolvedValue({
    status: 'stored',
    body: { cache: 'token', sessionId: 'session', visitId: 'visit' },
  });
});

test('stores one event and does not forward unrelated headers', async () => {
  const response = await handlePostHog(
    request(
      '/posthog/batch',
      { api_key: websiteId, event: 'clicked', distinct_id: 'user-1' },
      { 'user-agent': 'TestAgent', cookie: 'secret=1' },
    ),
  );

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: 1 });
  expect(mockedCollect).toHaveBeenCalledTimes(1);

  const [body, collectorRequest] = mockedCollect.mock.calls[0];
  expect(body.payload).toMatchObject({ website: websiteId, id: 'user-1', name: 'clicked' });
  expect(collectorRequest.headers.get('user-agent')).toBe('TestAgent');
  expect(collectorRequest.headers.get('cookie')).toBeNull();
  expect(collectorRequest.headers.get('content-type')).toBeNull();
});

test('does not call the collector when a later event is invalid', async () => {
  const response = await handlePostHog(
    request('/posthog/batch/', {
      api_key: websiteId,
      batch: [{ event: 'clicked', distinct_id: 'user-1' }, { event: 'clicked' }],
    }),
  );

  expect(response.status).toBe(400);
  expect(await response.text()).toBe('event submitted without a distinct_id');
  expect(mockedCollect).not.toHaveBeenCalled();
});

test('returns 503 after a later write fails', async () => {
  mockedCollect
    .mockResolvedValueOnce({
      status: 'stored',
      body: { cache: 'token', sessionId: 'session', visitId: 'visit' },
    })
    .mockResolvedValueOnce({ status: 'rejected', httpStatus: 400, message: 'Website not found.' });

  const response = await handlePostHog(
    request('/posthog/e/', {
      api_key: websiteId,
      batch: [
        { event: 'one', distinct_id: 'user-1' },
        { event: 'two', distinct_id: 'user-1' },
      ],
    }),
  );

  expect(response.status).toBe(503);
  expect(await response.text()).toBe('transient error, please retry');
  expect(mockedCollect).toHaveBeenCalledTimes(2);
});

test('returns the collector rejection when nothing has been stored', async () => {
  mockedCollect.mockResolvedValue({ status: 'rejected', httpStatus: 403 });

  const response = await handlePostHog(
    request('/posthog/capture', {
      api_key: websiteId,
      event: 'clicked',
      distinct_id: 'user-1',
    }),
  );

  expect(response.status).toBe(403);
  expect(mockedCollect).toHaveBeenCalledTimes(1);
});

test('treats engage without an event name as identify', async () => {
  const response = await handlePostHog(
    request('/posthog/engage/', {
      api_key: websiteId,
      distinct_id: 'user-4',
      $set: { name: 'Ada' },
    }),
  );

  expect(response.status).toBe(200);
  const [body] = mockedCollect.mock.calls[0];
  expect(body.type).toBe('identify');
  expect(body.payload.data).toEqual({ name: 'Ada' });
});

test('answers a beacon with an empty 204', async () => {
  const response = await handlePostHog(
    new Request(`http://localhost/posthog/e/?beacon=1`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({
        api_key: websiteId,
        event: 'clicked',
        distinct_id: 'user-1',
      }),
    }),
  );

  expect(response.status).toBe(204);
  expect(await response.text()).toBe('');
});
