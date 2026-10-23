import { z } from 'zod';
import { EVENT_NAME_LENGTH, PAGE_TITLE_LENGTH, UTM_PARAMS } from '@/lib/constants';
import { type CollectInput } from '@/server/collect-schema';
import {
  CLICK_PARAMS,
  DROPPED_PROPERTY_KEYS,
  HOSTNAME_LENGTH,
  IDENTIFY_EVENT,
  LANGUAGE_LENGTH,
  PAGEVIEW_EVENTS,
  POSTHOG_DISTINCT_ID_LENGTH,
  RELATIONAL_DISTINCT_ID_LENGTH,
  SCREEN_LENGTH,
} from './lib/policy';
import { type CaptureEvent } from './protocol';

const ipSchema = z.string().ip();

interface PageContext {
  url?: string;
  referrer?: string;
  hostname?: string;
  title?: string;
  language?: string;
  screen?: string;
}

interface ClientContext {
  ip?: string;
  userAgent?: string;
}

// distinct_id is the Umami session key, the same role as umami.identify(userId).
// $session_id is not that key. It stays in custom-event data and is dropped on pageviews.
export function translateEvent(
  event: CaptureEvent,
  websiteId: string,
  distinctIdLength = distinctIdLimit(),
): CollectInput[] {
  const pageview = PAGEVIEW_EVENTS.has(event.name);
  const person = { ...event.setOnce, ...event.set };
  const page = pageContext(event);
  const client = clientContext(event.properties);
  const campaign = campaignParams(event.properties);
  const properties = eventProperties(event.properties, pageview);
  const shared = {
    websiteId,
    distinctId: event.distinctId,
    distinctIdLength,
    occurredAt: event.occurredAt,
    page,
    client,
    campaign,
  };
  const bodies: CollectInput[] = [];

  if (event.name === IDENTIFY_EVENT || Object.keys(person).length) {
    bodies.push(
      collectBody({
        ...shared,
        type: 'identify',
        data: Object.keys(person).length ? person : undefined,
      }),
    );
  }

  if (event.name === IDENTIFY_EVENT) {
    return bodies;
  }

  bodies.push(
    collectBody({
      ...shared,
      type: 'event',
      name: pageview ? undefined : event.name,
      data: properties,
    }),
  );

  return bodies;
}

export function distinctIdLimit() {
  return process.env.CLICKHOUSE_URL ? POSTHOG_DISTINCT_ID_LENGTH : RELATIONAL_DISTINCT_ID_LENGTH;
}

function collectBody(input: {
  type: 'event' | 'identify';
  websiteId: string;
  distinctId: string;
  distinctIdLength: number;
  occurredAt?: Date;
  name?: string;
  page?: PageContext;
  client?: ClientContext;
  campaign?: Record<string, string>;
  data?: Record<string, any>;
}): CollectInput {
  const url = withCampaign(input.page?.url, input.campaign);
  const screen = fitScreen(input.page?.screen);
  const name = input.name?.slice(0, EVENT_NAME_LENGTH);

  return {
    type: input.type,
    payload: {
      website: input.websiteId,
      id: input.distinctId.slice(0, input.distinctIdLength),
      ...(input.occurredAt && { timestamp: Math.floor(input.occurredAt.getTime() / 1000) }),
      ...(url && { url }),
      ...sliceField('hostname', input.page?.hostname, HOSTNAME_LENGTH),
      ...sliceField('language', input.page?.language, LANGUAGE_LENGTH),
      ...(input.page?.referrer && { referrer: input.page.referrer }),
      ...(screen && { screen }),
      ...sliceField('title', input.page?.title, PAGE_TITLE_LENGTH),
      ...(name && { name }),
      ...(input.data && { data: input.data }),
      ...(input.client?.ip && { ip: input.client.ip }),
      ...(input.client?.userAgent && { userAgent: input.client.userAgent }),
    },
  };
}

function pageContext(event: CaptureEvent) {
  const properties = event.properties;
  const url = resolveUrl(event.name, properties);
  const referrer =
    usableReferrer(properties.$referrer) || usableReferrer(properties.$referring_domain);
  const hostname = text(properties.$host);
  const language = text(properties.$browser_language ?? properties.$locale);
  const screen = screenSize(properties);
  const title = resolveTitle(event.name, properties);
  const page = {
    ...(url && { url }),
    ...(referrer && { referrer }),
    ...(hostname && { hostname }),
    ...(language && { language }),
    ...(screen && { screen }),
    ...(title && { title }),
  };

  return Object.keys(page).length ? page : undefined;
}

function clientContext(properties: Record<string, any>) {
  const ip = text(properties.$ip);
  const userAgent = text(properties.$raw_user_agent);
  const client = {
    ...(ip && ipSchema.safeParse(ip).success && { ip }),
    ...(userAgent && { userAgent }),
  };

  return Object.keys(client).length ? client : undefined;
}

function eventProperties(properties: Record<string, any>, pageview: boolean) {
  const data: Record<string, any> = {};

  for (const [key, value] of Object.entries(properties)) {
    if (DROPPED_PROPERTY_KEYS.has(key)) {
      continue;
    }

    if (pageview && key.startsWith('$')) {
      continue;
    }

    data[key] = value;
  }

  return Object.keys(data).length ? data : undefined;
}

function campaignParams(properties: Record<string, any>) {
  const campaign: Record<string, string> = {};

  for (const key of [...UTM_PARAMS, ...CLICK_PARAMS]) {
    const value = properties[`$${key}`] ?? properties[key];

    if (
      value == null ||
      value === '' ||
      (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean')
    ) {
      continue;
    }

    campaign[key] = String(value);
  }

  return Object.keys(campaign).length ? campaign : undefined;
}

function resolveUrl(eventName: string, properties: Record<string, any>) {
  const current = usableUrl(properties.$current_url);

  if (current) {
    return current;
  }

  if (typeof properties.$pathname === 'string' && properties.$pathname) {
    if (typeof properties.$host === 'string' && properties.$host) {
      const path = properties.$pathname.startsWith('/')
        ? properties.$pathname
        : `/${properties.$pathname}`;

      return usableUrl(`https://${properties.$host}${path}`);
    }

    return usableUrl(properties.$pathname);
  }

  if (eventName === '$screen' && typeof properties.$screen_name === 'string') {
    return usableUrl(`/${properties.$screen_name}`);
  }

  return undefined;
}

function resolveTitle(eventName: string, properties: Record<string, any>) {
  const title =
    properties.$title ??
    properties.title ??
    (eventName === '$screen' ? properties.$screen_name : undefined);

  return text(title);
}

function screenSize(properties: Record<string, any>) {
  const { $screen_width: width, $screen_height: height } = properties;

  if (width == null || height == null) {
    return undefined;
  }

  const screen = `${width}x${height}`;

  if (!/^\d+x\d+$/.test(screen)) {
    return undefined;
  }

  return screen;
}

function withCampaign(url: string | undefined, campaign: Record<string, string> | undefined) {
  if (!campaign) {
    return url;
  }

  try {
    const parsed = new URL(url || '/', 'https://localhost');

    for (const key of [...UTM_PARAMS, ...CLICK_PARAMS]) {
      const value = campaign[key];

      if (value && !parsed.searchParams.has(key)) {
        parsed.searchParams.set(key, value);
      }
    }

    if (url && /^https?:\/\//i.test(url)) {
      return parsed.toString();
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return url;
  }
}

function fitScreen(screen: string | undefined) {
  if (!screen || screen.length > SCREEN_LENGTH || !/^\d+x\d+$/.test(screen)) {
    return undefined;
  }

  return screen;
}

function sliceField(
  key: 'hostname' | 'language' | 'title',
  value: string | undefined,
  max: number,
) {
  if (!value) {
    return {};
  }

  return { [key]: value.slice(0, max) };
}

function text(value: unknown) {
  if (typeof value !== 'string' || !value) {
    return undefined;
  }

  return value;
}

function usableUrl(value: unknown) {
  if (typeof value !== 'string' || !value || value.length > 4096) {
    return undefined;
  }

  try {
    new URL(value, 'https://localhost');
    return value;
  } catch {
    return undefined;
  }
}

function usableReferrer(value: unknown) {
  if (typeof value !== 'string' || !value) {
    return undefined;
  }

  if (/^https?:\/\//i.test(value) || value.startsWith('/')) {
    return usableUrl(value);
  }

  if (value.includes('.') && !value.includes(' ')) {
    return usableUrl(`https://${value}`);
  }

  return usableUrl(value);
}
