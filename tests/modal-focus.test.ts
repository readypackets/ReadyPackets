import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("shared modal focus lifecycle", () => {
  it("does not reset focus when a parent recreates its onClose callback during controlled input edits", () => {
    const source = readFileSync(resolve(process.cwd(), "client/src/components/ui/Modal.tsx"), "utf8");

    expect(source).toContain("const onCloseRef = useRef(onClose);");
    expect(source).toContain("onCloseRef.current = onClose;");
    expect(source).toContain("}, [open]);");
    expect(source).not.toContain("}, [open, onClose]);");
  });
});
