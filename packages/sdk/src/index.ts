export { Afterkey } from "@afterkey/core";
export type { AfterkeyConfig } from "@afterkey/core";
export { defineProvider, ProviderError } from "@afterkey/core";
export type {
  ProviderAdapter,
  ProviderConfig,
  ProviderDefinition,
} from "@afterkey/core";
export type {
  Connection,
  ConnectionStatus,
  Credential,
  LifecycleEvent,
  LifecycleEventType,
  ConnectOptions,
  ConnectResult,
  FetchOptions,
  RequireResult,
  TokenSet,
  AccountInfo,
  NormalizedError,
} from "@afterkey/core";
export type { StorageAdapter } from "@afterkey/core";
export type { LockAdapter, Lock } from "@afterkey/core";
export { MemoryStorageAdapter, MemoryLockAdapter } from "@afterkey/core";

export { google } from "@afterkey/providers";
export { github } from "@afterkey/providers";
export { microsoft } from "@afterkey/providers";
export { slack } from "@afterkey/providers";
export { sentry } from "@afterkey/providers";
