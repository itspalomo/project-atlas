import { describe, expect, it } from "vitest";
import { assertBridgeBootstrap, assertBridgeUser, BridgeAuthError, hashBridgeToken } from "./bridgeAuth.js";

describe("bridge auth helpers", () => {
  it("allows bootstrap access to any user", () => {
    expect(() => assertBridgeUser({ type: "bootstrap" }, "user-two")).not.toThrow();
  });

  it("allows device access only to its paired user", () => {
    expect(() => assertBridgeUser({ type: "device", userId: "user-one" }, "user-one")).not.toThrow();
    expect(() => assertBridgeUser({ type: "device", userId: "user-one" }, "user-two")).toThrow(BridgeAuthError);
  });

  it("requires bootstrap for device registration", () => {
    expect(() => assertBridgeBootstrap({ type: "bootstrap" })).not.toThrow();
    expect(() => assertBridgeBootstrap({ type: "device", userId: "user-one" })).toThrow(BridgeAuthError);
  });

  it("hashes bridge tokens deterministically without storing raw tokens", () => {
    expect(hashBridgeToken("token")).toBe(hashBridgeToken("token"));
    expect(hashBridgeToken("token")).not.toBe("token");
  });
});
