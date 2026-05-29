// 検証用 probe2: 案 B のレビューフロー (PR → bot 指摘 → code-review --fix → 報告 →
// 再レビュー → merge) をテスト走行するための一時ファイル。わざと軽い改善余地を
// 含めている (--fix が一部を直し、一部を skip する様子を観察するため)。検証後に削除する。

/**
 * ステータスレジスタの Carry ビット (bit0) を設定/クリアする。
 * @param status 現在のステータスレジスタ値 (8bit)
 * @param carry  立てるなら true
 */
export function setCarryFlag(status: number, carry: boolean): number {
  if (carry == true) {
    return status | 1;
  }
  return status & 254;
}
