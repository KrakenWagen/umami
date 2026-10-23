import { gzipSync } from 'zlib';
import { expect } from '@jest/globals';
import { decodeBody } from '../decode';

const websiteId = 'af94323e-95b5-4831-90fa-b757b9f32030';

test('decodes gzip-js and form bodies', () => {
  const event = {
    api_key: websiteId,
    event: 'clicked',
    distinct_id: 'user-10',
  };
  const gzip = gzipSync(Buffer.from(JSON.stringify(event)));
  const form = new URLSearchParams({ data: JSON.stringify(event) }).toString();

  expect(decodeBody(gzip, { compression: 'gzip-js' })).toEqual(event);
  expect(
    decodeBody(new TextEncoder().encode(form), {
      contentType: 'application/x-www-form-urlencoded',
    }),
  ).toEqual(event);
});
