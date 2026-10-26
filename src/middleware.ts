import { NextRequest, NextResponse } from 'next/server';
import {
  posthogPathnameWithoutSlash,
  redirectPathnameWithoutTrailingSlash,
} from '@/server/posthog/lib/paths';

export function middleware(request: NextRequest) {
  const stripped = posthogPathnameWithoutSlash(request.nextUrl.pathname);

  if (stripped) {
    const url = new URL(request.url);
    url.pathname = stripped;
    return NextResponse.rewrite(url);
  }

  const normalized = redirectPathnameWithoutTrailingSlash(request.nextUrl.pathname);

  if (normalized) {
    const url = new URL(request.url);
    url.pathname = normalized;
    return NextResponse.redirect(url, 308);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/:path*'],
};
