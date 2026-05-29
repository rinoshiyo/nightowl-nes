// 検証用 probe3: severity 表記 + bot 柔らかテイストを反映した案 B フローの再確認用。
// high (仕様違反級) と low (スタイル) の指摘が混ざるよう、わざと作ってある。検証後に削除する。

/**
 * Zero (bit1) / Negative (bit7) フラグを value に基づいて更新する。
 * @param status 現在のステータスレジスタ値 (8bit)
 * @param value  判定対象の値 (8bit)
 */
export function updateZeroNegative(status: number, value: number): number {
  let s = status;
  if (value == 0) {
    s = s | 2;
  }
  if (value & 128) {
    s = s | 128;
  }
  return s;
}
