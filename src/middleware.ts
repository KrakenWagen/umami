import { NextRequest, NextResponse } from 'next/server';
import { posthogPathnameWithoutSlash } from '@/server/posthog';

export function middleware(request: NextRequest) {
  const stripped = posthogPathnameWithoutSlash(request.nextUrl.pathname);

  if (!stripped) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = stripped;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ['/posthog/:path*'],
};
