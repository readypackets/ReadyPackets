import { describe, expect, it } from "vitest";
import { insertedId } from "../server/db/result.js";
import { invoiceNumberFor } from "../server/services/invoices.js";

describe("paid-order invoice identity", () => {
  it("extracts the MySQL insert id from the Drizzle tuple result", () => {
    expect(insertedId([{ insertId: 47 }, []])).toBe(47);
  });

  it("creates the canonical stable invoice number from that id", () => {
    expect(invoiceNumberFor(47, new Date("2026-08-16T00:00:00.000Z"))).toBe("RP-INV-2026-000047");
  });
});
