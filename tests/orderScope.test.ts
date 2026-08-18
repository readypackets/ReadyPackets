import { describe, expect, it } from "vitest";
import {
  deriveCanonicalP101Scope,
  resolveBundleScopeManifest,
} from "../server/services/orderScope.js";

const multiSelections = [
  { packetGroupId: 12, tier: "basic" },
  { packetGroupId: 4, tier: "Standard" },
];
const groupNumbers = new Map([[4, 1], [12, 2]]);

describe("P101 canonical order scope", () => {
  it("produces the required packet 1 Premium single-packet payload metadata", () => {
    expect(deriveCanonicalP101Scope([{ packetGroupId: 4, tier: "premium" }], groupNumbers)).toEqual({
      packet: "1",
      tier: "Premium",
      orderScopeMode: "single_packet",
      bundleScopeManifest: '{"packet_1":"Premium"}',
    });
  });

  it("produces packet 7 Mixed only for a true multi-packet partial order", () => {
    expect(deriveCanonicalP101Scope(multiSelections, groupNumbers)).toEqual({
      packet: "7",
      tier: "Mixed",
      orderScopeMode: "multi_packet_partial",
      bundleScopeManifest: '{"packet_1":"Standard","packet_2":"Basic"}',
    });
  });

  it("rebuilds legacy or administrator-supplied contradictions from actual purchased selections", () => {
    expect(resolveBundleScopeManifest('{ "packet_7": "Mixed" }', multiSelections, groupNumbers)).toBe(
      '{"packet_1":"Standard","packet_2":"Basic"}',
    );
  });

  it("rejects unsupported tiers rather than emitting a P101 payload that downstream routing cannot resolve", () => {
    expect(() => deriveCanonicalP101Scope([{ packetGroupId: 4, tier: "Mixed" }], groupNumbers)).toThrow(
      "P101 accepts only Basic, Standard, or Premium",
    );
  });

  it("rejects duplicate packet selections rather than selecting an arbitrary tier", () => {
    expect(() => deriveCanonicalP101Scope([
      { packetGroupId: 4, tier: "Basic" },
      { packetGroupId: 4, tier: "Premium" },
    ], groupNumbers)).toThrow("more than one tier for the same packet");
  });
});
