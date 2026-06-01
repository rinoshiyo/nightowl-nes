import { describe, it, expect } from "vitest";
import { formatErrorMessage } from "../src/browser/error-messages.ts";

describe("formatErrorMessage", () => {
  it("unsupported mapper のエラーを日本語化する", () => {
    const msg = formatErrorMessage("Unsupported mapper: 5");
    expect(msg).toContain("Mapper 5 は未対応です");
    expect(msg).toContain("NROM");
  });

  it("Mapper 番号なしのエラーを汎用メッセージにする", () => {
    const msg = formatErrorMessage("Mapper not found");
    expect(msg).toBe("このROMのMapperは未対応です");
  });

  it("magic mismatch を日本語化する", () => {
    const msg = formatErrorMessage("iNES: magic mismatch (expected 'NES\\x1A')");
    expect(msg).toBe("有効な NES ファイルではありません（iNES ヘッダが見つかりません）");
  });

  it("header too short を日本語化する", () => {
    const msg = formatErrorMessage("iNES: header too short (4 bytes)");
    expect(msg).toBe("ファイルが小さすぎます（NES ヘッダを読み取れません）");
  });

  it("PRG ROM overflows を日本語化する", () => {
    const msg = formatErrorMessage("PRG ROM overflows file");
    expect(msg).toBe("ファイルが壊れています（PRG ROM サイズがファイルサイズを超えています）");
  });

  it("未知のエラーはそのまま返す", () => {
    const msg = formatErrorMessage("Unknown error occurred");
    expect(msg).toBe("Unknown error occurred");
  });
});
