# Policy Center Document Import

ReadyPackets administrators can convert a prospective policy document into an editable Policy Center draft from **Admin → Policy Center**. The feature accepts `.doc`, `.docx`, and text-based `.pdf` files up to **5 MB**.

## Import and Review Workflow

Select **Import document** to create a new policy, or open **New version** on an existing policy and choose **Import DOC, DOCX, or PDF**. The portal uploads the file over the authenticated, CSRF-protected administrator session, validates the file signature against the selected extension, extracts text with self-hosted document tools, and normalizes it to editable Markdown.

> Importing does **not** publish a policy. The original source file is held only in a private temporary directory during conversion and is removed immediately afterward. The administrator must review the converted Markdown, choose the effective date and version, then use the existing publication control deliberately.

The converter preserves text and paragraph structure where possible. Administrators should carefully review headings, enumerated sections, lists, tables, signatures, legal citations, and any PDF layout before publication. Image-only/scanned PDFs are rejected with guidance to use an OCR-capable or text-based version.

| Format | Self-hosted conversion method | Review guidance |
|---|---|---|
| `.docx` | Reads the document XML from the signed ZIP container | Confirm heading and list formatting. |
| `.doc` | Uses `antiword` without macro execution | Legacy formatting may need cleanup. |
| `.pdf` | Uses `pdftotext`; no external OCR service is called | Review tables, columns, headers, and footers. |

The native installer installs `antiword` and `poppler-utils`; the Docker runtime includes the same packages. The import endpoint is administrator-only, rate-limited by the existing API middleware, CSRF-protected, limited to one 5 MB file, audited on successful conversion, and records blocked malformed imports without retaining their contents.

## Customer ID Standard

The public customer reference is now `RP-CUS-XXXXXXXX`, where the final opaque token is six to eight uppercase alphanumeric characters. The portal uses the same value for the customer-facing compatibility identifier, so legacy `RP-C0000XX` and `RP-U…` references no longer appear in active portal views. New order references use `RP-ORD-<customer-token>-YYMM-XXXXXX` and do not expose an internal numeric customer key.

Historical activity and already-delivered external webhook records are retained as evidence of their original transmission. Current customer records, order workspaces, future invoices, SharePoint folder names, and new outbound webhooks use the new active references.
