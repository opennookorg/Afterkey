import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { defineProvider } from "./factory.js";

describe("defineProvider factory", () => {
  const testProvider = defineProvider({
    id: "test",
    name: "Test Provider",
    authorization: {
      endpoint: "https://test.example.com/authorize",
      usePKCE: true,
    },
    token: {
      endpoint: "https://test.example.com/token",
      authMethod: "body",
    },
    refresh: { rotatesToken: false },
    scopes: { separator: " ", default: ["read"] },
    async identifyAccount() {
      return { id: "123", email: "test@test.com", displayName: "Test", workspaceId: null, workspaceName: null };
    },
    normalizeError(status) {
      return { permanent: status === 401, reason: "test", providerCode: null, retryable: status >= 500 };
    },
  });

  it("returns a factory function", () => {
    assert.equal(typeof testProvider, "function");
  });

  it("creates adapter with correct id and name", () => {
    const adapter = testProvider({ clientId: "id", clientSecret: "secret" });
    assert.equal(adapter.id, "test");
    assert.equal(adapter.name, "Test Provider");
  });

  it("generates authorization URL with PKCE", () => {
    const adapter = testProvider({ clientId: "id", clientSecret: "secret" });
    const url = adapter.authorize(["read", "write"], "state123", "verifier123", "http://localhost/cb");
    assert.ok(url.startsWith("https://test.example.com/authorize?"));
    assert.ok(url.includes("client_id=id"));
    assert.ok(url.includes("state=state123"));
    assert.ok(url.includes("code_challenge="));
    assert.ok(url.includes("code_challenge_method=S256"));
    assert.ok(url.includes("scope=read+write"));
  });

  it("generates authorization URL without PKCE when no verifier", () => {
    const adapter = testProvider({ clientId: "id", clientSecret: "secret" });
    const url = adapter.authorize(["read"], "state", null, "http://localhost/cb");
    assert.ok(!url.includes("code_challenge"));
  });
});
