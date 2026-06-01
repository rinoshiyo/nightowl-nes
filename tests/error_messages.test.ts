import { describe, it, expect } from "vitest";
import { formatErrorMessage } from "../src/browser/error-messages.ts";

describe("formatErrorMessage", () => {
  it("unsupported mapper のエラーを日本語化する", () => {
    const msg = formatErrorMessage("Unsupported mapper: 5");
    expect(msg).toContain("Mapper 5 は未対応です");
    expect(msg).toContain("NROM");
  });

  it("Unsupported mapper で番号なしの場合は汎用メッセージ", () => {
    const msg = formatErrorMessage("Unsupported mapper");
    expect(msg).toBe("このROMのMapperは未対応です");
  });

  it("Mapper を含むが Unsupported mapper でないエラーはそのまま返す", () => {
    const msg = formatErrorMessage("Mapper 4: bank index out of range");
    expect(msg).toBe("Mapper 4: bank index out of range");
  });

  it("magic mismatch を日本語化する", () => {
    const msg = formatErrorMessage("iNES: magic mismatch (expected 'NES\\x1A')");
    expect(msg).toBe("有効な NES ファイルではありません（iNES ヘッダが見つかりません）");
  });

  it("header too short を日本語化する", () => {
    const msg = formatErrorMessage("iNES: header too short (4 bytes)");
    expect(msg).toBe("ファイルが小さすぎます（NES ヘッダを読み取れません）");
  });

  it("PRG ROM truncated を日本語化する", () => {
    const msg = formatErrorMessage("iNES: PRG ROM truncated (expected 32768, got 16384)");
    expect(msg).toBe("ファイルが壊れています（PRG ROM サイズがファイルサイズを超えています）");
  });

  it("CHR ROM truncated を日本語化する", () => {
    const msg = formatErrorMessage("iNES: CHR ROM truncated (expected 8192, got 4096)");
    expect(msg).toBe("ファイルが壊れています（CHR ROM サイズがファイルサイズを超えています）");
  });

  it("未知のエラーはそのまま返す", () => {
    const msg = formatErrorMessage("Unknown error occurred");
    expect(msg).toBe("Unknown error occurred");
  });
});
