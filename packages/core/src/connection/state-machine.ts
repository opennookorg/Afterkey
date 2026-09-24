import type { ConnectionStatus, NormalizedError } from "../types.js";

type Transition = {
  from: ConnectionStatus[];
  to: ConnectionStatus;
};

const TRANSITIONS: Record<string, Transition> = {
  refresh_started: {
    from: ["HEALTHY", "DEGRADED"],
    to: "REFRESHING",
  },
  refresh_succeeded: {
    from: ["REFRESHING"],
    to: "HEALTHY",
  },
  refresh_failed_transient: {
    from: ["REFRESHING"],
    to: "DEGRADED",
  },
  refresh_failed_permanent: {
    from: ["REFRESHING", "HEALTHY", "DEGRADED"],
    to: "REAUTH_REQUIRED",
  },
  revoked: {
    from: ["HEALTHY", "REFRESHING", "DEGRADED", "REAUTH_REQUIRED"],
    to: "REVOKED",
  },
  restored: {
    from: ["REAUTH_REQUIRED", "REVOKED", "DEGRADED"],
    to: "HEALTHY",
  },
};

export function transition(
  current: ConnectionStatus,
  event: string
): ConnectionStatus | null {
  const t = TRANSITIONS[event];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function classifyRefreshError(error: NormalizedError): string {
  if (error.permanent) return "refresh_failed_permanent";
  if (error.retryable) return "refresh_failed_transient";
  return "refresh_failed_permanent";
}
