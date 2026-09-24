import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CredentialVault } from "./vault.js";

describe("CredentialVault", () => {
  const vault = new CredentialVault({ encryptionKey: "test-key-that-is-long-enough-for-scrypt" });

  it("encrypts and decrypts round-trip", () => {
    const plaintext = "super-secret-refresh-token-abc123";
    const encrypted = vault.encrypt(plaintext);
    assert.notEqual(encrypted, plaintext);
    assert.equal(vault.decrypt(encrypted), plaintext);
  });

  it("produces different ciphertext for same input", () => {
    const a = vault.encrypt("same");
    const b = vault.encrypt("same");
    assert.notEqual(a, b);
  });
});
