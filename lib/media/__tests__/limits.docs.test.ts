import { describe, it, expect } from "vitest";
import { validateUpload, kindForMime } from "@/lib/media/limits";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

describe("office document uploads", () => {
  it("accepts docx/xlsx as kind OTHER", () => {
    expect(kindForMime(DOCX)).toBe("OTHER");
    expect(validateUpload(DOCX, 1024)).toBe("OTHER");
    expect(validateUpload(XLSX, 1024)).toBe("OTHER");
  });
  it("still rejects genuinely unknown types", () => {
    expect(() => validateUpload("application/x-msdownload", 1024)).toThrow();
  });
  it("enforces the 25MB document limit", () => {
    expect(() => validateUpload(DOCX, 26 * 1024 * 1024)).toThrow();
  });
});
