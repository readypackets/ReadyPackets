import { createHash, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const POLICY_IMPORT_MAX_BYTES = 5 * 1024 * 1024;
export const POLICY_IMPORT_ACCEPT = ".doc,.docx,.pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf";

export type ImportedPolicyDraft = {
  sourceType: "doc" | "docx" | "pdf";
  originalName: string;
  sha256: string;
  suggestedTitle: string;
  markdown: string;
  warnings: string[];
};

function safeOriginalName(name: string) {
  const normalized = name.normalize("NFKC").replace(/[\x00-\x1F<>:"/\\|?*]+/g, "-").trim();
  return normalized.slice(0, 180) || "policy-document";
}

function fileStem(name: string) {
  return safeOriginalName(name)
    .replace(/\.[a-z0-9]{1,8}$/i, "")
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160) || "Imported policy";
}

function detectPolicyFileType(buffer: Buffer, originalName: string): "doc" | "docx" | "pdf" | null {
  const lower = originalName.toLowerCase();
  const pdf = buffer.subarray(0, 5).toString("ascii") === "%PDF-";
  const ole = buffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  const zip = buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  if (pdf && lower.endsWith(".pdf")) return "pdf";
  if (ole && lower.endsWith(".doc")) return "doc";
  if (zip && lower.endsWith(".docx")) return "docx";
  return null;
}

function xmlText(xml: string) {
  return xml
    .replace(/<w:tab\b[^>]*\/>/g, "\t")
    .replace(/<w:br\b[^>]*\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function paragraphToMarkdown(paragraph: string) {
  const compact = paragraph.replace(/\s+/g, " ").trim();
  if (!compact) return "";
  if (/^(article|section)\s+[ivxlcdm0-9]+\b/i.test(compact) || /^\d+(?:\.\d+){0,3}\.?\s+/.test(compact)) {
    return `## ${compact}`;
  }
  if (compact.length <= 120 && /^[A-Z0-9][A-Z0-9 ,&()'’/\-:]+$/.test(compact) && /[A-Z]{3}/.test(compact)) {
    return `## ${compact.replace(/\s+/g, " ")}`;
  }
  return compact;
}

export function normalizePolicyTextToMarkdown(rawText: string) {
  const normalized = rawText
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f\v]+/g, " ")
    .replace(/\u0000/g, "")
    .trim();
  const blocks = normalized
    .split(/\n\s*\n+/)
    .map((block) => paragraphToMarkdown(block))
    .filter(Boolean);
  return blocks.join("\n\n").trim();
}

async function extractText(type: "doc" | "docx" | "pdf", sourcePath: string) {
  if (type === "doc") {
    const { stdout } = await execFileAsync("antiword", ["-w", "0", sourcePath], { maxBuffer: 12 * 1024 * 1024, timeout: 20_000 });
    return stdout;
  }
  if (type === "docx") {
    const { stdout } = await execFileAsync("unzip", ["-p", sourcePath, "word/document.xml"], { maxBuffer: 12 * 1024 * 1024, timeout: 20_000 });
    return xmlText(stdout);
  }
  const { stdout } = await execFileAsync("pdftotext", ["-layout", "-enc", "UTF-8", sourcePath, "-"], { maxBuffer: 12 * 1024 * 1024, timeout: 20_000 });
  return stdout;
}

/**
 * Extract a policy draft from a file held in memory. The upload is copied into
 * a private temporary directory solely for native conversion, then securely
 * removed in the finally block. No uploaded legal document is retained until
 * an administrator reviews and explicitly publishes the resulting Markdown.
 */
export async function importPolicyDocument(input: { buffer: Buffer; originalName: string }): Promise<ImportedPolicyDraft> {
  if (input.buffer.length === 0 || input.buffer.length > POLICY_IMPORT_MAX_BYTES) {
    throw new Error("Policy import files must be between 1 byte and 5 MB.");
  }
  const originalName = safeOriginalName(input.originalName);
  const sourceType = detectPolicyFileType(input.buffer, originalName);
  if (!sourceType) {
    throw new Error("Upload a valid .doc, .docx, or text-based .pdf file. The file contents must match its extension.");
  }

  const workDir = await mkdtemp(join(tmpdir(), "readypackets-policy-import-"));
  const sourcePath = join(workDir, `${randomBytes(12).toString("hex")}.${sourceType}`);
  try {
    await writeFile(sourcePath, input.buffer, { mode: 0o600 });
    let extracted: string;
    try {
      extracted = await extractText(sourceType, sourcePath);
    } catch {
      throw new Error("This document could not be converted. Re-save it as an editable DOCX or a text-based PDF and try again.");
    }
    const markdown = normalizePolicyTextToMarkdown(extracted);
    if (markdown.length < 40) {
      const pdfHint = sourceType === "pdf" ? " This PDF may be scanned or image-only; use an OCR-capable copy before importing." : "";
      throw new Error(`No usable policy text was found.${pdfHint}`);
    }
    if (markdown.length > 500_000) {
      throw new Error("The converted policy is too large. Split the document into smaller policy sections before importing.");
    }
    const warnings: string[] = ["Review headings, lists, tables, signatures, and legal citations before publishing. Imported files are converted to editable Markdown; the original file is not retained."];
    if (sourceType === "pdf") warnings.push("PDF layout, tables, and image-only text may require editing after conversion.");
    if (sourceType === "doc") warnings.push("Legacy DOC formatting is converted as plain text and may require heading cleanup.");
    return {
      sourceType,
      originalName,
      sha256: createHash("sha256").update(input.buffer).digest("hex"),
      suggestedTitle: fileStem(originalName),
      markdown,
      warnings,
    };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

export function isAcceptedPolicyImportMime(mime: string) {
  return new Set([
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/pdf",
    "application/octet-stream",
  ]).has(mime);
}
