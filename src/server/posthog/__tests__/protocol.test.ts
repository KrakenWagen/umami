import { expect } from '@jest/globals';
import { PostHogRequestError } from '../lib/errors';
import { parseCapture } from '../protocol';

const websiteId = 'af94323e-95b5-4831-90fa-b757b9f32030';
const now = new Date('2024-04-03T12:00:00.000Z');

function parse(payload: unknown, kind: 'capture' | 'engage' = 'capture', at = now) {
  return parseCapture(payload, { kind, now: at });
}

test('reads a batch envelope and distinct_id from properties', () => {
  const batch = parse({
    api_key: websiteId,
    sent_at: '2024-04-03T12:00:00.000Z',
    batch: [
      {
        event: 'clicked',
        timestamp: '2024-04-03T11:59:50.000Z',
        properties: { distinct_id: 'user-2', source: 'email' },
      },
    ],
  });

  expect(batch.token).toBe(websiteId);
  expect(batch.events[0].distinctId).toBe('user-2');
  expect(batch.events[0].occurredAt?.toISOString()).toBe('2024-04-03T11:59:50.000Z');
});

test('top-level distinct_id wins over the property', () => {
  const batch = parse({
    api_key: websiteId,
    event: 'clicked',
    distinct_id: 'top',
    properties: { distinct_id: 'nested' },
  });

  expect(batch.events[0].distinctId).toBe('top');
});

test('stringifies a numeric distinct id and keeps the posthog length cap', () => {
  const batch = parse({
    api_key: websiteId,
    event: 'clicked',
    distinct_id: 'd'.repeat(250),
  });

  expect(batch.events[0].distinctId).toHaveLength(200);

  const numeric = parse({
    api_key: websiteId,
    event: '$pageview',
    distinct_id: 42,
  });

  expect(numeric.events[0].distinctId).toBe('42');
});

test('corrects client clock skew with sent_at', () => {
  const batch = parse(
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
    'capture',
    new Date('2024-04-03T12:00:20.000Z'),
  );

  expect(batch.events[0].occurredAt?.toISOString()).toBe('2024-04-03T12:00:10.000Z');
});

test('drops performance events and still accepts the batch', () => {
  expect(
    parse({
      api_key: websiteId,
      batch: [{ event: '$performance_event', distinct_id: 'user-6' }],
    }).events,
  ).toEqual([]);
});

test('accepts an array body and a token alias', () => {
  const batch = parse([
    {
      event: 'clicked',
      distinct_id: 'user-7',
      $token: websiteId,
    },
  ]);

  expect(batch.token).toBe(websiteId);
  expect(batch.events[0].distinctId).toBe('user-7');
});

test('treats an engage payload without an event name as identify', () => {
  const batch = parse(
    {
      api_key: websiteId,
      distinct_id: 'user-4',
      $set: { name: 'Ada' },
    },
    'engage',
  );

  expect(batch.events[0].name).toBe('$identify');
  expect(batch.events[0].set).toEqual({ name: 'Ada' });
});

test('rejects a missing distinct id, a missing token, and a non-uuid token', () => {
  expect(() => parse({ api_key: websiteId, event: 'clicked' })).toThrow(PostHogRequestError);
  expect(() => parse({ api_key: websiteId, event: 'clicked' })).toThrow(
    'event submitted without a distinct_id',
  );

  try {
    parse({ event: 'clicked', distinct_id: 'user-8' });
  } catch (error) {
    expect(error).toMatchObject({ status: 401, message: 'event submitted without an api_key' });
  }

  try {
    parse({ api_key: 'phc_test', event: 'clicked', distinct_id: 'user-8' });
  } catch (error) {
    expect(error).toMatchObject({ status: 401, message: 'API key is not valid' });
  }
});

test('rejects inconsistent batch tokens', () => {
  const otherId = '11111111-1111-4111-8111-111111111111';

  expect(() =>
    parse({
      api_key: websiteId,
      batch: [
        { event: 'one', distinct_id: 'user-9', token: websiteId },
        { event: 'two', distinct_id: 'user-9', token: otherId },
      ],
    }),
  ).toThrow('batch submitted with inconsistent api_key values');
});
