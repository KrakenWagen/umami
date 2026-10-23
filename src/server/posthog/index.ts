import { handlePostHog } from './handle';

export { posthogPathnameWithoutSlash } from './lib/paths';

export function GET(request: Request) {
  return handlePostHog(request);
}

export function POST(request: Request) {
  return handlePostHog(request);
}

export function OPTIONS() {
  return Response.json({ status: 1 });
}
