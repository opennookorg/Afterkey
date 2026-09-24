import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { transition, classifyRefreshError } from "./state-machine.js";

describe("connection state machine", () => {
  it("transitions HEALTHY to REFRESHING on refresh_started", () => {
    assert.equal(transition("HEALTHY", "refresh_started"), "REFRESHING");
  });

  it("transitions REFRESHING to HEALTHY on refresh_succeeded", () => {
    assert.equal(transition("REFRESHING", "refresh_succeeded"), "HEALTHY");
  });

  it("transitions REFRESHING to DEGRADED on transient failure", () => {
    assert.equal(transition("REFRESHING", "refresh_failed_transient"), "DEGRADED");
  });

  it("transitions to REAUTH_REQUIRED on permanent failure", () => {
    assert.equal(transition("REFRESHING", "refresh_failed_permanent"), "REAUTH_REQUIRED");
    assert.equal(transition("HEALTHY", "refresh_failed_permanent"), "REAUTH_REQUIRED");
  });

  it("returns null for invalid transitions", () => {
    assert.equal(transition("REVOKED", "refresh_started"), null);
    assert.equal(transition("HEALTHY", "refresh_succeeded"), null);
  });

  it("classifies permanent errors correctly", () => {
    assert.equal(
      classifyRefreshError({ permanent: true, reason: "revoked", providerCode: null, retryable: false }),
      "refresh_failed_permanent"
    );
  });

  it("classifies transient errors correctly", () => {
    assert.equal(
      classifyRefreshError({ permanent: false, reason: "timeout", providerCode: null, retryable: true }),
      "refresh_failed_transient"
    );
  });
});
