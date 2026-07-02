import { describe, it, expect } from "vitest";

/**
 * Tests for file type validation logic used by the upload API.
 *
 * The upload route checks magic bytes to prevent type spoofing.
 * These tests verify the validation function works correctly.
 */

// ── Magic bytes validation (extracted from upload route) ─────────

const ALLOWED_TYPES = {
  "application/pdf": {
    magicBytes: [0x25, 0x50, 0x44, 0x46], // %PDF
    extension: ".pdf",
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    magicBytes: [0x50, 0x4b, 0x03, 0x04], // PK (ZIP/DOCX)
    extension: ".docx",
  },
} as const;

function validateFileBytes(
  buffer: Buffer,
  declaredType: string
): { valid: boolean; reason?: string } {
  const typeInfo = ALLOWED_TYPES[declaredType as keyof typeof ALLOWED_TYPES];

  if (!typeInfo) {
    return {
      valid: false,
      reason: `Unsupported file type: ${declaredType}`,
    };
  }

  const header = Array.from(buffer.subarray(0, 4));
  const matches = typeInfo.magicBytes.every(
    (byte: number, i: number) => header[i] === byte
  );

  if (!matches) {
    return {
      valid: false,
      reason: "File content doesn't match its declared type",
    };
  }

  return { valid: true };
}

// ── Tests ────────────────────────────────────────────────────────

describe("validateFileBytes", () => {
  it("accepts a valid PDF file", () => {
    // %PDF magic bytes followed by some content
    const pdfBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e]);
    const result = validateFileBytes(pdfBuffer, "application/pdf");
    expect(result.valid).toBe(true);
  });

  it("accepts a valid DOCX file", () => {
    // PK (ZIP) magic bytes
    const docxBuffer = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
    const result = validateFileBytes(
      docxBuffer,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    expect(result.valid).toBe(true);
  });

  it("rejects a file with wrong magic bytes for PDF", () => {
    // DOCX bytes but declared as PDF
    const buffer = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
    const result = validateFileBytes(buffer, "application/pdf");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("doesn't match");
  });

  it("rejects an unsupported file type", () => {
    const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG magic bytes
    const result = validateFileBytes(buffer, "image/png");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Unsupported");
  });

  it("rejects a plain text file declared as PDF", () => {
    const buffer = Buffer.from("Hello, World!");
    const result = validateFileBytes(buffer, "application/pdf");
    expect(result.valid).toBe(false);
  });

  it("rejects a file too short for magic byte check", () => {
    const buffer = Buffer.from([0x25]); // Only 1 byte
    const result = validateFileBytes(buffer, "application/pdf");
    expect(result.valid).toBe(false);
  });

  it("rejects a renamed .exe file declared as PDF", () => {
    // MZ header (Windows executable)
    const buffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00]);
    const result = validateFileBytes(buffer, "application/pdf");
    expect(result.valid).toBe(false);
  });
});
