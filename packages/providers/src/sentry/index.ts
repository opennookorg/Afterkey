import { defineProvider } from "@afterkey/core";

export const sentry = defineProvider({
  id: "sentry",
  name: "Sentry",

  authorization: {
    endpoint: "https://sentry.io/oauth/authorize/",
    usePKCE: false,
  },

  token: {
    endpoint: "https://sentry.io/oauth/token/",
    authMethod: "body",
  },

  refresh: {
    endpoint: "https://sentry.io/oauth/token/",
    rotatesToken: true,
  },

  scopes: {
    separator: " ",
    default: ["project:read", "org:read"],
  },

  async identifyAccount(accessToken) {
    const res = await fetch("https://sentry.io/api/0/", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = (await res.json()) as { user: { id: string; email: string; name: string } };
    return {
      id: data.user.id,
      email: data.user.email,
      displayName: data.user.name,
      workspaceId: null,
      workspaceName: null,
    };
  },

  normalizeError(status, body) {
    const err = body as { error?: string } | null;
    const code = err?.error ?? "unknown";

    if (code === "invalid_grant" || status === 401) {
      return { permanent: true, reason: "token_revoked", providerCode: code, retryable: false };
    }
    return { permanent: false, reason: code, providerCode: code, retryable: status >= 500 };
  },
});
