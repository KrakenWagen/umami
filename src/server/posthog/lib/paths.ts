export const POSTHOG_PREFIX = '/posthog';

export const POSTHOG_ROUTES = [
  { suffix: 'batch', kind: 'capture' },
  { suffix: 'e', kind: 'capture' },
  { suffix: 'capture', kind: 'capture' },
  { suffix: 'track', kind: 'capture' },
  { suffix: 'engage', kind: 'engage' },
  { suffix: 'i/v0/e', kind: 'capture' },
] as const;

export type CaptureKind = (typeof POSTHOG_ROUTES)[number]['kind'];

export function stripTrailingSlash(pathname: string) {
  return pathname.replace(/\/+$/, '') || '/';
}

export function captureKind(pathname: string): CaptureKind | undefined {
  const stripped = stripTrailingSlash(pathname);
  const route = POSTHOG_ROUTES.find(item => {
    const path = `${POSTHOG_PREFIX}/${item.suffix}`;
    return stripped === path || stripped.endsWith(path);
  });

  return route?.kind;
}

// SDKs append a trailing slash. Next would 308 that, which sendBeacon drops.
export function posthogPathnameWithoutSlash(pathname: string) {
  const stripped = stripTrailingSlash(pathname);

  if (!captureKind(pathname) || stripped === pathname) {
    return;
  }

  return stripped;
}
