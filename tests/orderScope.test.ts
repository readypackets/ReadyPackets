import { describe, expect, it } from "vitest";
import { resolveBundleScopeManifest } from "../server/services/orderScope.js";

const selections = [
  { packetGroupId: 12, tier: "Basic" },
  { packetGroupId: 4, tier: "Standard" },
];
const groupNumbers = new Map([[4, 1], [12, 2]]);

describe("resolveBundleScopeManifest", () => {
  it("derives the escaped webhook string from selected packet tiers when the stored manifest is empty", () => {
    const manifest = resolveBundleScopeManifest("{}", selections, groupNumbers);
    expect(manifest).toBe('{"packet_1":"Standard","packet_2":"Basic"}');
    expect(JSON.parse(manifest)).toEqual({ packet_1: "Standard", packet_2: "Basic" });
  });

  it("rebuilds malformed legacy values from the durable order selections", () => {
    expect(resolveBundleScopeManifest("not-json", selections, groupNumbers)).toBe('{"packet_1":"Standard","packet_2":"Basic"}');
  });

  it("preserves a valid non-empty administrator-supplied scope while normalizing its serialization", () => {
    expect(resolveBundleScopeManifest('{ "packet_7": "Mixed" }', selections, groupNumbers)).toBe('{"packet_7":"Mixed"}');
  });
});
