import { isbot } from 'isbot';
import { startOfHour, startOfMonth } from 'date-fns';
import clickhouse from '@/lib/clickhouse';
import { badRequest, forbidden, json } from '@/lib/response';
import { fetchWebsite } from '@/lib/load';
import { getClientInfo, hasBlockedIp } from '@/lib/detect';
import { createToken, parseToken } from '@/lib/jwt';
import { secret, uuid, hash } from '@/lib/crypto';
import { COLLECTION_TYPE } from '@/lib/constants';
import { safeDecodeURI, safeDecodeURIComponent } from '@/lib/url';
import { DynamicData } from '@/lib/types';
import { createSession, saveEvent, saveSessionData } from '@/queries';
import { type CollectInput } from '@/server/collect-schema';

export type CollectOutcome =
  | { status: 'stored'; body: { cache: string; sessionId: string; visitId: string } }
  | { status: 'bot' }
  | { status: 'rejected'; httpStatus: 400; message: string }
  | { status: 'rejected'; httpStatus: 403 };

export async function collect(input: CollectInput, request: Request): Promise<CollectOutcome> {
  const { type, payload } = input;

  const {
    website: websiteId,
    hostname,
    screen,
    language,
    url,
    referrer,
    name,
    data,
    title,
    tag,
    timestamp,
    id,
  } = payload;

  let cache: { websiteId: string; sessionId: string; visitId: string; iat: number } | null = null;
  const cacheHeader = request.headers.get('x-umami-cache');

  if (cacheHeader) {
    const result = await parseToken(cacheHeader, secret());

    if (result) {
      cache = result;
    }
  }

  if (!cache?.websiteId) {
    const website = await fetchWebsite(websiteId);

    if (!website) {
      return { status: 'rejected', httpStatus: 400, message: 'Website not found.' };
    }
  }

  const { ip, userAgent, device, browser, os, country, region, city } = await getClientInfo(
    request,
    payload,
  );

  if (!process.env.DISABLE_BOT_CHECK && isbot(userAgent)) {
    return { status: 'bot' };
  }

  if (hasBlockedIp(ip)) {
    return { status: 'rejected', httpStatus: 403 };
  }

  const createdAt = timestamp ? new Date(timestamp * 1000) : new Date();
  const now = Math.floor(new Date().getTime() / 1000);

  const sessionSalt = hash(startOfMonth(createdAt).toUTCString());
  const visitSalt = hash(startOfHour(createdAt).toUTCString());

  const sessionId = id ? uuid(websiteId, id) : uuid(websiteId, ip, userAgent, sessionSalt);

  if (!clickhouse.enabled && !cache?.sessionId) {
    await createSession(
      {
        id: sessionId,
        websiteId,
        browser,
        os,
        device,
        screen,
        language,
        country,
        region,
        city,
        distinctId: id,
      },
      { skipDuplicates: true },
    );
  }

  let visitId = cache?.visitId || uuid(sessionId, visitSalt);
  let iat = cache?.iat || now;

  if (!timestamp && now - iat > 1800) {
    visitId = uuid(sessionId, visitSalt);
    iat = now;
  }

  if (type === COLLECTION_TYPE.event) {
    const base = hostname ? `https://${hostname}` : 'https://localhost';
    const currentUrl = new URL(url, base);

    let urlPath = currentUrl.pathname === '/undefined' ? '' : currentUrl.pathname + currentUrl.hash;
    const urlQuery = currentUrl.search.substring(1);
    const urlDomain = currentUrl.hostname.replace(/^www./, '');

    let referrerPath: string | undefined;
    let referrerQuery: string | undefined;
    let referrerDomain: string | undefined;

    const utmSource = currentUrl.searchParams.get('utm_source');
    const utmMedium = currentUrl.searchParams.get('utm_medium');
    const utmCampaign = currentUrl.searchParams.get('utm_campaign');
    const utmContent = currentUrl.searchParams.get('utm_content');
    const utmTerm = currentUrl.searchParams.get('utm_term');

    const gclid = currentUrl.searchParams.get('gclid');
    const fbclid = currentUrl.searchParams.get('fbclid');
    const msclkid = currentUrl.searchParams.get('msclkid');
    const ttclid = currentUrl.searchParams.get('ttclid');
    const lifatid = currentUrl.searchParams.get('li_fat_id');
    const twclid = currentUrl.searchParams.get('twclid');

    if (process.env.REMOVE_TRAILING_SLASH) {
      urlPath = urlPath.replace(/\/(?=(#.*)?$)/, '');
    }

    if (referrer) {
      const referrerUrl = new URL(referrer, base);

      referrerPath = referrerUrl.pathname;
      referrerQuery = referrerUrl.search.substring(1);

      if (referrerUrl.hostname !== 'localhost') {
        referrerDomain = referrerUrl.hostname.replace(/^www\./, '');
      }
    }

    await saveEvent({
      websiteId,
      sessionId,
      visitId,
      createdAt,

      pageTitle: safeDecodeURIComponent(title),
      hostname: hostname || urlDomain,
      urlPath: safeDecodeURI(urlPath),
      urlQuery,
      referrerPath: safeDecodeURI(referrerPath),
      referrerQuery,
      referrerDomain,

      distinctId: id,
      browser,
      os,
      device,
      screen,
      language,
      country,
      region,
      city,

      eventName: name,
      eventData: data,
      tag,

      utmSource,
      utmMedium,
      utmCampaign,
      utmContent,
      utmTerm,

      gclid,
      fbclid,
      msclkid,
      ttclid,
      lifatid,
      twclid,
    });
  }

  if (type === COLLECTION_TYPE.identify) {
    if (data) {
      await saveSessionData({
        websiteId,
        sessionId,
        sessionData: data as DynamicData,
        distinctId: id,
        createdAt,
      });
    }
  }

  const token = createToken({ websiteId, sessionId, visitId, iat }, secret());

  return { status: 'stored', body: { cache: token, sessionId, visitId } };
}

export function collectResponse(outcome: CollectOutcome) {
  if (outcome.status === 'bot') {
    return json({ beep: 'boop' });
  }

  if (outcome.status === 'rejected') {
    if (outcome.httpStatus === 403) {
      return forbidden();
    }

    return badRequest(outcome.message);
  }

  return json(outcome.body);
}
