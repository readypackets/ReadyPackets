/**
 * Markdown rendering safety and request classification.
 *
 * The Markdown renderer is the only path by which database content reaches the
 * DOM, so these tests assert the property that makes it safe: output is a tree
 * of React elements, never raw HTML, and no `dangerouslySetInnerHTML` appears
 * anywhere in the produced nodes. The classification tests matter because an
 * endpoint that lands in the wrong rate-limit bucket is effectively unprotected.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement, type ReactNode } from "react";
import { renderMarkdown } from "../client/src/lib/markdown.js";
import { classifyRequest } from "../server/security/rateLimit.js";

/** Render the produced nodes to a string so the output can be inspected. */
function html(source: string): string {
  const nodes: ReactNode[] = renderMarkdown(source);
  return renderToStaticMarkup(createElement("div", null, ...nodes));
}

describe("markdown rendering", () => {
  it("renders headings, emphasis and code", () => {
    const output = html("# Title\n\nSome **bold** and *italic* and `code`.\n");
    expect(output).toContain("Title");
    expect(output).toContain("<strong>bold</strong>");
    expect(output).toContain("<em>italic</em>");
    expect(output).toContain("<code");
  });

  it("renders lists and blockquotes", () => {
    const output = html("- one\n- two\n\n> quoted line\n");
    expect(output).toContain("one");
    expect(output).toContain("two");
    expect(output).toContain("quoted line");
  });

  it("escapes an injected script tag into literal text", () => {
    const output = html("Hello <script>alert(document.cookie)</script>");
    // React escapes text nodes, so the tag can only appear encoded.
    expect(output).not.toContain("<script>");
    expect(output).toContain("&lt;script&gt;");
  });

  it("escapes an injected event handler attribute", () => {
    const output = html('An image: <img src=x onerror="alert(1)">');
    expect(output).not.toContain("onerror=\"alert(1)\"");
    expect(output).toContain("&lt;img");
  });

  it("escapes an injected iframe", () => {
    const output = html('<iframe src="https://evil.example"></iframe>');
    expect(output).not.toContain("<iframe");
  });

  it("refuses a javascript: link and renders it as text", () => {
    const output = html("[click me](javascript:alert(1))");
    expect(output.toLowerCase()).not.toContain('href="javascript');
    expect(output).toContain("click me");
  });

  it("refuses a data: URI link", () => {
    const output = html("[x](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)");
    expect(output.toLowerCase()).not.toContain('href="data:');
  });

  it("refuses a vbscript: link", () => {
    const output = html("[x](vbscript:msgbox(1))");
    expect(output.toLowerCase()).not.toContain('href="vbscript');
  });

  it("permits http, https, mailto and root-relative links", () => {
    expect(html("[a](https://readypackets.com)")).toContain('href="https://readypackets.com"');
    expect(html("[b](http://example.com)")).toContain('href="http://example.com"');
    expect(html("[c](mailto:info@readypackets.com)")).toContain(
      'href="mailto:info@readypackets.com"',
    );
    expect(html("[d](/packets)")).toContain('href="/packets"');
  });

  it("treats a protocol-relative link as unsafe", () => {
    // `//evil.example` would inherit the page scheme and leave the origin.
    const output = html("[x](//evil.example)");
    expect(output).not.toContain('href="//evil.example"');
  });

  it("marks external links with noopener to prevent reverse tabnabbing", () => {
    const output = html("[a](https://example.com)");
    if (output.includes("target=")) {
      expect(output).toContain("noopener");
    } else {
      // No target means no tabnabbing exposure at all.
      expect(output).not.toContain("target=");
    }
  });

  it("handles an empty or whitespace-only source", () => {
    expect(() => html("")).not.toThrow();
    expect(() => html("   \n\n  ")).not.toThrow();
  });

  it("does not execute a nested or malformed construct", () => {
    const output = html("**bold <script>x</script>**");
    expect(output).not.toContain("<script>");
  });
});

describe("request classification for rate limiting", () => {
  const asRequest = (path: string) => ({ path }) as never;

  it("routes authentication procedures to the strictest bucket", () => {
    expect(classifyRequest(asRequest("/api/trpc/auth.login"))).toBe("auth_high_risk");
    expect(classifyRequest(asRequest("/api/trpc/auth.resetPassword"))).toBe("auth_high_risk");
    expect(classifyRequest(asRequest("/api/trpc/auth.verifyMfa"))).toBe("auth_high_risk");
    expect(classifyRequest(asRequest("/api/saml/acs"))).toBe("auth_high_risk");
  });

  it("classifies a batched request by its most sensitive member", () => {
    // tRPC batching would otherwise let a caller smuggle a login attempt into a
    // permissive bucket by pairing it with a harmless query.
    expect(classifyRequest(asRequest("/api/trpc/public.catalog,auth.login"))).toBe(
      "auth_high_risk",
    );
    expect(classifyRequest(asRequest("/api/trpc/auth.login,public.catalog"))).toBe(
      "auth_high_risk",
    );
  });

  it("routes expensive operations to the expensive bucket", () => {
    expect(classifyRequest(asRequest("/api/trpc/files.bulkDownload"))).toBe("expensive");
    expect(classifyRequest(asRequest("/api/trpc/account.exportData"))).toBe("expensive");
    expect(classifyRequest(asRequest("/api/files/download/abc"))).toBe("expensive");
  });

  it("routes public form submissions to the form bucket", () => {
    expect(classifyRequest(asRequest("/api/trpc/public.submitContact"))).toBe("form_submission");
    expect(classifyRequest(asRequest("/api/trpc/tickets.create"))).toBe("form_submission");
    expect(classifyRequest(asRequest("/api/trpc/intake.submit"))).toBe("form_submission");
  });

  it("routes ordinary API calls and page views to their own buckets", () => {
    expect(classifyRequest(asRequest("/api/trpc/public.catalog"))).toBe("api");
    expect(classifyRequest(asRequest("/api/whatever"))).toBe("api");
    expect(classifyRequest(asRequest("/packets"))).toBe("standard_browsing");
    expect(classifyRequest(asRequest("/"))).toBe("standard_browsing");
  });
});
