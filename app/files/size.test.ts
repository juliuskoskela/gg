import { describe, expect, it } from "vitest";
import { formatSize } from "./size";

describe("file sizes", () => {
    it("uses binary units with a decimal only when needed", () => {
        expect(formatSize(0)).toBe("0 bytes");
        expect(formatSize(1)).toBe("1 byte");
        expect(formatSize(12 * 1024)).toBe("12 KB");
        expect(formatSize(5 * 1024 * 1024)).toBe("5 MB");
        expect(formatSize(14.2 * 1024 * 1024)).toBe("14.2 MB");
    });
});
