import { expect } from '@jest/globals';
import { parseCapture } from '../protocol';
import { translateEvent } from '../translate';

const websiteId = 'af94323e-95b5-4831-90fa-b757b9f32030';
const now = new Date('2024-04-03T12:00:00.000Z');

function translate(payload: unknown, at = now, kind: 'capture' | 'engage' = 'capture') {
  const batch = parseCapture(payload, { kind, now: at });
  return batch.events.flatMap(event => translateEvent(event, batch.token, 50));
}

test('maps a single capture to an umami event', () => {
  const [event] = translate({
    api_key: websiteId,
    event: 'user signed up',
    distinct_id: 'user-1',
    properties: { plan: 'pro' },
    timestamp: '2024-04-03T12:00:00.000Z',
  });

  expect(event).toEqual({
    type: 'event',
    payload: {
      website: websiteId,
      id: 'user-1',
      name: 'user signed up',
      timestamp: 1712145600,
      data: { plan: 'pro' },
    },
  });
});

test('maps a pageview onto umami page fields and appends campaign params', () => {
  const [event] = translate({
    token: websiteId,
    event: '$pageview',
    distinct_id: 42,
    properties: {
      $current_url: 'https://example.com/docs?utm_source=existing',
      $host: 'example.com',
      $referrer: 'https://google.com/search',
      $browser_language: 'en-US',
      $screen_width: 1920,
      $screen_height: 1080,
      $title: 'Docs',
      $utm_medium: 'cpc',
      plan: 'pro',
      $lib: 'web',
    },
  });

  expect(event).toEqual({
    type: 'event',
    payload: {
      website: websiteId,
      id: '42',
      url: 'https://example.com/docs?utm_source=existing&utm_medium=cpc',
      hostname: 'example.com',
      language: 'en-US',
      referrer: 'https://google.com/search',
      screen: '1920x1080',
      title: 'Docs',
      data: { plan: 'pro' },
    },
  });
});

test('maps a screen view to a pageview', () => {
  const [event] = translate({
    api_key: websiteId,
    event: '$screen',
    distinct_id: 'device-1',
    properties: { $screen_name: 'Home' },
  });

  expect(event.payload.name).toBeUndefined();
  expect(event.payload.url).toBe('/Home');
  expect(event.payload.title).toBe('Home');
});

test('maps identify properties and keeps set ahead of set_once', () => {
  const [identify, event] = translate({
    api_key: websiteId,
    event: 'signup',
    distinct_id: 'user-3',
    properties: {
      plan: 'pro',
      $set_once: { first_seen: 'yesterday' },
      $set: { email: 'a@example.com', first_seen: 'today' },
    },
  });

  expect(identify).toEqual({
    type: 'identify',
    payload: {
      website: websiteId,
      id: 'user-3',
      data: { first_seen: 'today', email: 'a@example.com' },
    },
  });
  expect(event.type).toBe('event');
  expect(event.payload.name).toBe('signup');
  expect(event.payload.data).toEqual({ plan: 'pro' });
});

test('copies client context onto identify so the session is not created blank', () => {
  const [identify, event] = translate({
    api_key: websiteId,
    event: '$pageview',
    distinct_id: 'user-3b',
    properties: {
      $current_url: 'https://example.com/docs',
      $browser_language: 'en-US',
      $screen_width: 1920,
      $screen_height: 1080,
      $set: { email: 'a@example.com' },
    },
  });

  expect(identify.payload).toMatchObject({
    screen: '1920x1080',
    language: 'en-US',
    url: 'https://example.com/docs',
    data: { email: 'a@example.com' },
  });
  expect(event.payload.screen).toBe('1920x1080');
  expect(event.payload.name).toBeUndefined();
});

test('passes through the client ip and user agent', () => {
  const [event] = translate({
    api_key: websiteId,
    event: 'clicked',
    distinct_id: 'user-11',
    properties: {
      $ip: '203.0.113.8',
      $raw_user_agent: 'Mozilla/5.0',
    },
  });

  expect(event.payload.ip).toBe('203.0.113.8');
  expect(event.payload.userAgent).toBe('Mozilla/5.0');
});

test('fits distinct ids and event names to the collector limits', () => {
  const [event] = translate({
    api_key: websiteId,
    event: 'e'.repeat(80),
    distinct_id: 'd'.repeat(80),
  });

  expect(event.payload.id).toHaveLength(50);
  expect(event.payload.name).toHaveLength(50);
});

test('stores the corrected timestamp in unix seconds', () => {
  const [event] = translate(
    {
      api_key: websiteId,
      sent_at: '2024-04-03T12:00:10.000Z',
      batch: [
        {
          event: 'clicked',
          distinct_id: 'user-5',
          timestamp: '2024-04-03T12:00:00.000Z',
        },
      ],
    },
    new Date('2024-04-03T12:00:20.000Z'),
  );

  expect(event.payload.timestamp).toBe(1712145610);
});
