import { describe, expect, it } from "vitest";
import { buildOrderFileName, orderFilePrefix } from "../server/services/fileNaming.js";

describe("order file naming", () => {
  const customerPublicId = "RP-U-8AF39C12D4E5";
  const orderNumber = "RP-2026-00142";
  const prefix = orderFilePrefix(customerPublicId, orderNumber);

  it("prepends the customer public ID and order number to a normal file name", () => {
    expect(buildOrderFileName({ customerPublicId, orderNumber, sourceName: "Investor Notes.pdf" }))
      .toBe(`${prefix}Investor Notes.pdf`);
  });

  it("preserves the file extension while constraining names to the database limit", () => {
    const result = buildOrderFileName({
      customerPublicId,
      orderNumber,
      sourceName: `${"x".repeat(400)}.webm`,
    });
    expect(result.startsWith(prefix)).toBe(true);
    expect(result.endsWith(".webm")).toBe(true);
    expect(result.length).toBeLessThanOrEqual(255);
  });

  it("is idempotent and does not duplicate the tracking prefix", () => {
    const once = buildOrderFileName({ customerPublicId, orderNumber, sourceName: "pitch.webm" });
    expect(buildOrderFileName({ customerPublicId, orderNumber, sourceName: once })).toBe(once);
  });

  it("removes path components and unsafe characters from the external display name", () => {
    const result = buildOrderFileName({ customerPublicId, orderNumber, sourceName: "../../Plan<>Final?.docx" });
    expect(result).toBe(`${prefix}Plan_Final.docx`);
    expect(result).not.toMatch(/[\\/<>?]/);
  });
});
