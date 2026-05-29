// 検証用の一時ファイル: code-review skill の実挙動 (agent spawn / --comment / --fix /
// 投稿名義) を観察するためだけに置く。レビューが何か指摘できるよう、わざと軽い
// 論点を含めている。検証完了後に削除する。

/**
 * 8bit 値同士を加算する (検証用ダミー)。
 * NES の 6502 は 8bit レジスタなので本来は 0xFF で wrap させるべきだが、
 * ここでは意図的に wrap を省いている (code-review が突くか観察するため)。
 */
export function addByte(a: number, b: number): number {
  var sum = a + b;
  return sum;
}
