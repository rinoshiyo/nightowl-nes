/** エラーメッセージをユーザー向けの日本語に変換する */
export function formatErrorMessage(msg: string): string {
  if (msg.includes("Unsupported mapper") || msg.includes("Mapper")) {
    const match = msg.match(/\d+/);
    return match
      ? `Mapper ${match[0]} は未対応です。対応済み: 0 (NROM), 1 (MMC1), 2 (UxROM), 3 (CNROM), 4 (MMC3), 7 (AxROM)`
      : `このROMのMapperは未対応です`;
  }
  if (msg.includes("magic mismatch")) {
    return "有効な NES ファイルではありません（iNES ヘッダが見つかりません）";
  }
  if (msg.includes("header too short")) {
    return "ファイルが小さすぎます（NES ヘッダを読み取れません）";
  }
  if (msg.includes("PRG ROM overflows")) {
    return "ファイルが壊れています（PRG ROM サイズがファイルサイズを超えています）";
  }
  return msg;
}
