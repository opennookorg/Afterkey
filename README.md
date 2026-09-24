# Afterkey

Open-source connection runtime for AI applications. Connect users to third-party APIs once, and Afterkey handles everything that happens after authentication: token refresh, rotation, crash recovery, locking, scope upgrades, and reconnection.

**Connect once. Afterkey handles what happens after the key.**

## Why

Every app that connects to Google, Slack, GitHub, or any OAuth provider eventually hits the same problems: tokens expire, refresh tokens rotate, concurrent requests race on refresh, processes crash mid-rotation, and users revoke access without warning. Developers rebuild this infrastructure for every provider, every time.

Afterkey handles the full credential lifecycle so you don't have to:

```
Connect -> Store -> Use -> Refresh -> Rotate -> Monitor -> Recover -> Reconnect
```

## Quick Start

```bash
pnpm add @afterkey/sdk
```

```ts
import { Afterkey, google, sentry } from "@afterkey/sdk";

const afterkey = new Afterkey({
  providers: [
    google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
    sentry({
      clientId: process.env.SENTRY_CLIENT_ID,
      clientSecret: process.env.SENTRY_CLIENT_SECRET,
    }),
  ],
  encryptionKey: process.env.ENCRYPTION_KEY,
});
```

### Connect a user

```ts
const { authorizationUrl, sessionId } = await afterkey.connect({
  userId: "usr_123",
  provider: "google",
});

// Redirect user to authorizationUrl
// After OAuth callback:
const connection = await afterkey.handleCallback(state, code);
```

### Use the connection

```ts
const response = await afterkey.fetch({
  connectionId: connection.id,
  url: "https://gmail.googleapis.com/gmail/v1/users/me/messages",
});
```

If the token expired, Afterkey refreshes it transparently. If 100 requests hit at once, one refresh happens. If the credential is permanently revoked, you get a clear `REAUTH_REQUIRED` status, not a cryptic provider error.

### Check scope requirements

```ts
const result = await afterkey.require(connection.id, ["gmail.send"]);

if (!result.ready) {
  // result.authorizationUrl has the upgrade flow
  // result.missingScopes tells you what's needed
}
```

### Reconnect after revocation

```ts
const { authorizationUrl } = await afterkey.reconnect(connection.id);
// Same connection ID is preserved after re-authorization
```

### List connections and events

```ts
const connections = await afterkey.connections.list("usr_123", "google");
const timeline = await afterkey.connections.events(connection.id);
```

### Listen to lifecycle events

```ts
afterkey.events.on("connection.reauth_required", (event) => {
  notify(event.connectionId, event.reason);
});
```

## Providers

| Provider  | OAuth | PKCE | Token Rotation | Scopes |
|-----------|-------|------|----------------|--------|
| Google    | 2.0   | Yes  | No             | Space-separated |
| GitHub    | 2.0   | No   | Yes            | Space-separated |
| Microsoft | 2.0   | Yes  | Yes            | Space-separated |
| Slack     | 2.0   | No   | Yes            | Comma-separated |
| Sentry    | 2.0   | No   | Yes            | Space-separated |

## Adding a Provider

Every provider is a single `defineProvider` call:

```ts
import { defineProvider } from "@afterkey/core";

export const myProvider = defineProvider({
  id: "my-provider",
  name: "My Provider",

  authorization: {
    endpoint: "https://provider.com/oauth/authorize",
    usePKCE: true,
  },

  token: {
    endpoint: "https://provider.com/oauth/token",
    authMethod: "body",
  },

  refresh: {
    rotatesToken: false,
  },

  scopes: {
    separator: " ",
    default: ["read"],
  },

  async identifyAccount(accessToken) {
    const res = await fetch("https://provider.com/api/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json();
    return {
      id: data.id,
      email: data.email,
      displayName: data.name,
      workspaceId: null,
      workspaceName: null,
    };
  },

  normalizeError(status, body) {
    if (status === 401) {
      return { permanent: true, reason: "unauthorized", providerCode: null, retryable: false };
    }
    return { permanent: false, reason: "unknown", providerCode: null, retryable: status >= 500 };
  },
});
```

No core changes needed. Drop the file in `packages/providers/src/` and re-export it.

## Architecture

```
packages/
  core/           Runtime engine
    afterkey.ts           Main Afterkey class
    types.ts              All shared types
    provider/
      factory.ts          defineProvider factory + ProviderAdapter
    credential/
      vault.ts            AES-256-GCM encryption for credentials at rest
      refresh-engine.ts   Token refresh with distributed locking
    connection/
      state-machine.ts    HEALTHY -> REFRESHING -> DEGRADED -> REAUTH_REQUIRED -> REVOKED
    oauth/
      handler.ts          Connect, callback, reconnect flows
    events/
      emitter.ts          Lifecycle event emitter
    storage/
      interface.ts        Pluggable storage contract
      memory.ts           In-memory adapter (dev/test)
    locking/
      interface.ts        Pluggable lock contract
      memory.ts           In-memory adapter (dev/test)

  providers/      Provider adapters (Google, GitHub, Microsoft, Slack, Sentry)

  sdk/            Public entry point (@afterkey/sdk)
```

### Connection State Machine

```
HEALTHY -----> REFRESHING -----> HEALTHY
   |               |
   |               +-----------> DEGRADED (transient failure, retryable)
   |               |
   |               +-----------> REAUTH_REQUIRED (permanent failure)
   |
   +----------------------------> REAUTH_REQUIRED (permanent failure)
   +----------------------------> REVOKED

REAUTH_REQUIRED / REVOKED -----> HEALTHY (after reconnect)
```

### Refresh Engine

When a token is expired and multiple requests arrive concurrently:

1. First request acquires a distributed lock
2. All other requests wait
3. One refresh call goes to the provider
4. New credentials are persisted atomically with version check (stale-write rejection)
5. Lock releases, all waiting requests continue with the fresh token

### Credential Vault

All tokens are encrypted at rest with AES-256-GCM. Access tokens and refresh tokens never appear in logs, events, or API responses. Encryption key is derived via scrypt.

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm typecheck
```

Requires Node 22+ and pnpm.

## What Afterkey is Not

Afterkey is not a connector marketplace, workflow builder, unified API, agent framework, or tool catalog. It does one thing: make user-connected APIs reliable to operate.

## Roadmap

- [ ] Postgres storage adapter
- [ ] Redis distributed lock adapter
- [ ] HTTP server with connect/callback routes
- [ ] Background refresh worker (proactive refresh before expiry)
- [ ] Dashboard UI for connection health
- [ ] Python SDK
- [ ] More providers (Salesforce, Linear, Notion, Jira, etc.)

## License

Apache-2.0
