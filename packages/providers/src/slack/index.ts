import { defineProvider } from "@afterkey/core";

export const slack = defineProvider({
  id: "slack",
  name: "Slack",

  authorization: {
    endpoint: "https://slack.com/oauth/v2/authorize",
    usePKCE: false,
  },

  token: {
    endpoint: "https://slack.com/api/oauth.v2.access",
    authMethod: "body",
  },

  refresh: {
    endpoint: "https://slack.com/api/oauth.v2.access",
    rotatesToken: true,
  },

  scopes: {
    separator: ",",
    default: ["users:read", "channels:read"],
  },

  async identifyAccount(accessToken) {
    const res = await fetch("https://slack.com/api/auth.test", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = (await res.json()) as {
      ok: boolean;
      user_id: string;
      user: string;
      team_id: string;
      team: string;
    };
    return {
      id: data.user_id,
      email: null,
      displayName: data.user,
      workspaceId: data.team_id,
      workspaceName: data.team,
    };
  },

  normalizeError(status, body) {
    const err = body as { ok?: boolean; error?: string } | null;
    const code = err?.error ?? "unknown";

    const permanentErrors = ["token_revoked", "invalid_auth", "account_inactive", "org_login_required"];
    if (permanentErrors.includes(code)) {
      return { permanent: true, reason: code, providerCode: code, retryable: false };
    }
    return { permanent: false, reason: code, providerCode: code, retryable: true };
  },
});
