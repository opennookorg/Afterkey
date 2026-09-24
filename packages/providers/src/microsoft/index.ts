import { defineProvider } from "@afterkey/core";

export const microsoft = defineProvider({
  id: "microsoft",
  name: "Microsoft",

  authorization: {
    endpoint: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    params: {
      response_mode: "query",
    },
    usePKCE: true,
  },

  token: {
    endpoint: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    authMethod: "body",
  },

  refresh: {
    rotatesToken: true,
  },

  scopes: {
    separator: " ",
    default: ["openid", "email", "profile", "offline_access"],
  },

  async identifyAccount(accessToken) {
    const res = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = (await res.json()) as { id: string; mail: string; displayName: string };
    return {
      id: data.id,
      email: data.mail,
      displayName: data.displayName,
      workspaceId: null,
      workspaceName: null,
    };
  },

  normalizeError(status, body) {
    const err = body as { error?: string; error_codes?: number[] } | null;
    const code = err?.error ?? "unknown";
    const codes = err?.error_codes ?? [];

    const permanentCodes = [70011, 70012, 700084, 50076, 50078];
    if (codes.some((c) => permanentCodes.includes(c)) || code === "invalid_grant") {
      return { permanent: true, reason: "refresh_token_expired", providerCode: code, retryable: false };
    }
    if (status === 401) {
      return { permanent: true, reason: "unauthorized", providerCode: code, retryable: false };
    }
    return { permanent: false, reason: code, providerCode: code, retryable: status >= 500 };
  },
});
