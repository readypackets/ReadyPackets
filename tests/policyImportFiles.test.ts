import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { importPolicyDocument } from "../server/services/policyImport.js";

const legalDir = resolve(process.cwd(), "docs/legal");

describe("Policy Center file import", () => {
  it("converts a DOCX policy agreement into a reviewable Markdown draft without retaining the source", async () => {
    const buffer = await readFile(resolve(legalDir, "ReadyPackets_Prospective_Partner_MNDA_Draft.docx"));
    const draft = await importPolicyDocument({ buffer, originalName: "Partner NDA.docx" });
    expect(draft.sourceType).toBe("docx");
    expect(draft.suggestedTitle).toBe("Partner NDA");
    expect(draft.markdown).toContain("MUTUAL NON-DISCLOSURE AGREEMENT");
    expect(draft.markdown).toContain("ReadyPackets");
    expect(draft.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("converts a text-based PDF policy agreement into a reviewable Markdown draft", async () => {
    const buffer = await readFile(resolve(legalDir, "ReadyPackets_Prospective_Partner_MNDA_Draft.pdf"));
    const draft = await importPolicyDocument({ buffer, originalName: "Partner NDA.pdf" });
    expect(draft.sourceType).toBe("pdf");
    expect(draft.markdown).toContain("MUTUAL NON-DISCLOSURE AGREEMENT");
    expect(draft.warnings.some((warning) => /PDF layout/i.test(warning))).toBe(true);
  });
});
