# Afterkey

Open-source connection runtime for AI applications. Handles the full lifecycle of user-connected third-party accounts: OAuth, credential storage, token refresh, rotation, locking, reconnection, and observability.

## Architecture

pnpm monorepo with three packages:

- `packages/core` - Runtime engine: types, provider factory, credential vault, refresh engine, state machine, OAuth handler, storage/locking interfaces, in-memory adapters
- `packages/providers` - Provider adapter implementations (Google, GitHub, Microsoft, Slack, Sentry) using `defineProvider` factory
- `packages/sdk` - Public entry point re-exporting core + providers as `@afterkey/sdk`

## Key Patterns

**Provider Factory** (`defineProvider`): every provider is a `ProviderDefinition` passed to `defineProvider()`, which returns a function `(config: ProviderConfig) => ProviderAdapter`. The adapter handles authorize, exchangeCode, refresh, identifyAccount, and normalizeError. Adding a provider means one file with a single `defineProvider` call.

**Connection State Machine** (`connection/state-machine.ts`): deterministic transitions between HEALTHY, REFRESHING, DEGRADED, REAUTH_REQUIRED, REVOKED. No direct status writes, always go through `transition()`.

**Refresh Engine** (`credential/refresh-engine.ts`): distributed-lock-guarded refresh. N concurrent requests produce 1 provider refresh call. Stale-write rejection via credential versioning. Crash safety via transactional persistence.

**Storage/Locking Interfaces**: pluggable via `StorageAdapter` and `LockAdapter`. Memory implementations for dev/test, Postgres and Redis for production.

## Commands

```bash
pnpm install          # install all dependencies
pnpm build            # build all packages
pnpm typecheck        # type-check all packages
pnpm test             # run tests
```

## Adding a Provider

1. Create `packages/providers/src/{name}/index.ts`
2. Call `defineProvider({...})` with the provider's OAuth endpoints, scopes, identifyAccount, normalizeError
3. Export from `packages/providers/src/index.ts`
4. Re-export from `packages/sdk/src/index.ts`

## Coding Conventions

- No code comments (code should be self-explanatory through naming)
- One-line docstrings only
- Top-level imports only
- No em-dashes in code or prose
- ESM throughout (`"type": "module"`)
- Node 22+ (ES2022 target)

## Files That Matter

- `packages/core/src/afterkey.ts` - Main `Afterkey` class, ties everything together
- `packages/core/src/provider/factory.ts` - `defineProvider` factory and `ProviderAdapter` interface
- `packages/core/src/credential/refresh-engine.ts` - Token refresh with distributed locking
- `packages/core/src/credential/vault.ts` - AES-256-GCM encryption for credentials
- `packages/core/src/connection/state-machine.ts` - Connection status transitions
- `packages/core/src/oauth/handler.ts` - OAuth connect/callback/reconnect flows
- `packages/core/src/storage/interface.ts` - Storage adapter contract
- `packages/core/src/locking/interface.ts` - Lock adapter contract
