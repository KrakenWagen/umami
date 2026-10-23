# Server layout

`collect.ts` is the Umami writer. The PostHog bridge reads an SDK request, translates it, and calls that writer. Solid arrows are the request. Dotted arrows are shared lookups.

```mermaid
flowchart TD
  sdk["PostHog SDK"]

  subgraph door ["HTTP"]
    paths["posthog/lib/paths.ts"]
    mw["src/middleware.ts and docker/middleware.ts"]
    routes["route.ts for batch, e, capture, track, engage, i/v0/e"]
    index["posthog/index.ts"]
  end

  subgraph bridge ["Translation"]
    handle["posthog/handle.ts"]
    decode["posthog/decode.ts"]
    protocol["posthog/protocol.ts"]
    translate["posthog/translate.ts"]
    policy["posthog/lib/policy.ts"]
    errors["posthog/lib/errors.ts"]
  end

  subgraph store ["Collector"]
    submit["posthog/submit.ts"]
    schema["collect-schema.ts"]
    collect["collect.ts"]
    send["POST /api/send"]
  end

  sdk --> mw --> routes --> index --> handle
  handle --> decode --> protocol --> translate --> submit
  submit --> collect
  send --> collect

  paths -.-> index
  paths -.-> handle
  policy -.-> protocol
  policy -.-> translate
  schema -.-> translate
  schema -.-> submit
  schema -.-> send
  errors -.-> decode
  errors -.-> protocol
  errors -.-> handle
  errors -.-> submit
```

`index.ts` re-exports the trailing-slash helper from `lib/paths.ts`. Both middlewares import that helper from `posthog/index.ts`. `decode.ts` turns gzip, form, and base64 into JSON. `protocol.ts` turns that JSON into PostHog events. `translate.ts` turns each event into the body `collect()` accepts. `submit.ts` checks every body, then writes.
