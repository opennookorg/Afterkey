import { defineProvider } from "@afterkey/core";

export const github = defineProvider({
  id: "github",
  name: "GitHub",

  authorization: {
    endpoint: "https://github.com/login/oauth/authorize",
    usePKCE: false,
  },

  token: {
    endpoint: "https://github.com/login/oauth/access_token",
    authMethod: "body",
  },

  refresh: {
    rotatesToken: true,
  },

  scopes: {
    separator: " ",
    default: ["read:user", "user:email"],
  },

  async identifyAccount(accessToken) {
    const res = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
      },
    });
    const data = (await res.json()) as { id: number; login: string; email: string | null };
    return {
      id: String(data.id),
      email: data.email,
      displayName: data.login,
      workspaceId: null,
      workspaceName: null,
    };
  },

  normalizeError(status, body) {
    const err = body as { error?: string } | null;
    const code = err?.error ?? "unknown";

    if (code === "bad_refresh_token") {
      return { permanent: true, reason: "refresh_token_invalid", providerCode: code, retryable: false };
    }
    if (status === 401) {
      return { permanent: true, reason: "unauthorized", providerCode: code, retryable: false };
    }
    return { permanent: false, reason: code, providerCode: code, retryable: status >= 500 };
  },
});
