# Collection API docs

These notes describe the two event contracts this server understands, and how one is translated into the other.

| Guide | What it covers |
| --- | --- |
| [PostHog capture API](posthog-api.md) | The HTTP contract PostHog SDK clients send to a capture host. |
| [Umami collection API](umami-api.md) | The original collect API: `POST /api/send` and `POST /api/batch`. |
| [PostHog to Umami mapping](posthog-umami-mapping.md) | How the bridge turns a PostHog capture request into in-process collector calls. |

The authenticated reporting and admin routes under `src/app/api/websites`, `src/app/api/reports`, and `src/app/api/teams` are a separate API. They are not part of event ingestion.
