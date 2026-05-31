# 夜 031: PPU スクロール (coarse + fine X/Y)

## ゴール (/goal)

```
/goal night/031-ppu-scrolling ブランチで実装し、 nightly CI 緑、 PR が main に merge commit 完了、 nights/pending/031-ppu-scrolling.md が nights/done/ に移動済み、 or stop after 80 turns
```

完了時 transcript 必須出力: `🎯 GOAL CONDITION MET: night 031 merged`

## 前提

- 夜 030 done: PPU スプライト描画・OAM DMA 動作
- PPU 背景描画は実装済みだが scrollX/scrollY が描画に反映されていない
- PPUSCROLL ($2005) write で scrollX/scrollY は格納される (writeToggle ベース)
- ネームテーブルミラーリングは `(addr - 0x2000) & 0x7FF` の簡易実装 (カートの mirroring 設定を無視)
- Cartridge は `mirroring: "horizontal" | "vertical"` を parse 済み
- nestest trace は全 8991 行完走済み (TRACE_LINES 変更なし)
- 仕様参照: https://www.nesdev.org/wiki/PPU_scrolling / https://www.nesdev.org/wiki/PPU_nametables

## ブランチ運用

`night/031-ppu-scrolling` ブランチで実装、完了時に PR を立てる。main 直 push は hook で deny。

## 設計概要

### ネームテーブルミラーリング修正

現在の `mirrorNametable()` はカートの mirroring 設定を考慮していない。修正:

- **水平ミラー (vertical arrangement)**: NT0=NT1, NT2=NT3 → bit10 無視
  - $2000/$2400 → vram[0..0x3FF], $2800/$2C00 → vram[0x400..0x7FF]
- **垂直ミラー (horizontal arrangement)**: NT0=NT2, NT1=NT3 → bit11 無視
  - $2000/$2800 → vram[0..0x3FF], $2400/$2C00 → vram[0x400..0x7FF]

PPU にカート参照を持たせ (コンストラクタ or setter)、mirroring mode に応じてアドレス変換。

### スクロールの背景描画への適用

現在の `fetchBgTile(tileX)` は scroll offset を無視している。修正:

- **Fine X scroll** (0-7 pixel): ピクセル単位のサブタイルオフセット。`renderBgPixel()` の bitPos 計算に反映
- **Coarse X scroll** (tile 単位): `fetchBgTile()` でタイル座標に scrollX >> 3 を加算。32 タイル境界で隣の nametable に wrap
- **Y scroll**: `scrollY` をスキャンラインに加算し、coarseY / fineY を再計算。240 ライン境界で nametable 切替 (NES は 30 タイル行 = 240 ピクセルで垂直 wrap)

### スクロール適用の具体ロジック

```
globalX = scrollX + dot - 1
tileCol = (globalX >> 3) & 0x1F
fineX   = globalX & 7
ntSelectX = (globalX >> 8) & 1  // 256px 境界で隣の NT

globalY = scrollY + scanline
tileRow = (globalY >> 3) % 30    // 30タイル行で wrap
fineY   = globalY & 7
ntSelectY = (globalY >= 240) ? 1 : 0  // 240px 境界で上下 NT 切替

ntIndex = baseNT ^ (ntSelectX) ^ (ntSelectY << 1)
ntAddr  = 0x2000 + (ntIndex << 10) + tileRow * 32 + tileCol
```

### PPUCTRL bit0-1 (base nametable)

PPUCTRL の下位 2 bit はベースネームテーブルを選択する:
- 0: $2000, 1: $2400, 2: $2800, 3: $2C00

スクロール計算で ntIndex の起点として使用。

## サブゴール

1. **G1: ネームテーブルミラーリング修正** — PPU にカート参照を渡し、mirrorNametable() を mirroring mode 対応に修正
2. **G2: X スクロール実装** — scrollX の coarse (タイル) + fine (ピクセル) を背景描画に反映。NT 境界 wrap 対応
3. **G3: Y スクロール実装** — scrollY を scanline に加算し coarseY/fineY/NT切替 を正しく計算
4. **G4: テスト** — ミラーリング / X scroll / Y scroll / NT 境界 wrap のテスト

## 実装ステップ

1. `git checkout main && git pull`
2. `git checkout -b night/031-ppu-scrolling`
3. G1: PPU にカート (mirroring) 参照を渡し `mirrorNametable()` を水平/垂直ミラー対応に修正
4. G1: テスト (`tests/ppu_mirroring.test.ts` or 既存テストに追加)
5. G2: `fetchBgTile()` を scroll offset 対応に修正 (globalX 計算 + NT wrap)
6. G2: `renderBgPixel()` に fine X 反映 (bitPos 計算を globalX & 7 ベースに)
7. G3: Y scroll 適用 (globalY から coarseY/fineY/ntSelectY を計算)
8. G4: スクロールのテスト (`tests/ppu_scroll.test.ts`)
9. `bun test` + `bunx tsc --noEmit` + `bunx eslint`
10. `git mv nights/pending/031-ppu-scrolling.md nights/done/031-ppu-scrolling.md`
11. `git push -u origin night/031-ppu-scrolling`
12. `gh pr create`
13. `code-review --fix` → triage → 全 PASS なら merge

## 検証チャンネル

- テスト pass: `✅ PASS: <test_name>`
- 型チェック: `✅ TYPECHECK: clean`
- PR 作成: `🔀 PR OPENED: <URL>`
- main merge 確認: `🎯 GOAL CONDITION MET: night 031 merged`

## コミット粒度 (Conventional Commits)

- `fix(core): ネームテーブルミラーリングをカート設定対応に修正`
- `feat(core): PPU 背景描画に X スクロール (coarse + fine) 適用`
- `feat(core): PPU 背景描画に Y スクロール適用`
- `test(core): PPU スクロール + ミラーリングテスト`
- `chore(nights): 031 を done に移動`

最低 5 commit。

## DoD (完了条件)

- [ ] `night/031-ppu-scrolling` ブランチで作業
- [ ] PPU がカートの mirroring mode ("horizontal" / "vertical") を参照する
- [ ] 水平ミラー: $2000/$2400 が同一、$2800/$2C00 が同一
- [ ] 垂直ミラー: $2000/$2800 が同一、$2400/$2C00 が同一
- [ ] scrollX の coarse 成分 (bit3-7) が背景タイル選択に反映される
- [ ] scrollX の fine 成分 (bit0-2) が背景ピクセルオフセットに反映される
- [ ] X スクロールが 256px (32 タイル) 境界で隣の nametable に wrap する
- [ ] scrollY が背景描画の Y 座標に加算される
- [ ] scrollY + scanline が 240 を超えた場合、垂直方向の NT 切替が行われる
- [ ] fineY (scrollY + scanline の下位 3bit) がパターンテーブル行選択に反映される
- [ ] PPUCTRL bit0-1 のベース nametable 選択がスクロール計算に反映される
- [ ] ネームテーブルミラーリングのテストが pass
- [ ] X スクロール (fine + coarse + NT wrap) のテストが pass
- [ ] Y スクロール (+ NT 垂直切替) のテストが pass
- [ ] 既存のスプライト / 背景テストが引き続き pass
- [ ] `bun test` 全 pass
- [ ] `bunx tsc --noEmit` 警告ゼロ
- [ ] `bunx eslint 'src/**/*.ts' 'tests/**/*.ts' --max-warnings 0` 警告ゼロ
- [ ] nestest trace テスト pass (TRACE_LINES = 8991、変更なし)
- [ ] git log に最低 5 commit
- [ ] `nights/pending/031-ppu-scrolling.md` を `nights/done/` に `git mv`
- [ ] PR が立っており merge commit で main に反映済み

## 実装上の注意

- PPU のスクロール機構を `src/core/ppu.ts` に閉じる (DOM 依存禁止)
- 今回は「static scroll」(フレーム先頭で 1 度だけ PPUSCROLL 設定) をターゲット。mid-frame scroll split (ステータスバー等) は将来夜
- loopy 内部レジスタ (t/v/x) の完全実装は将来夜。今回は scrollX/scrollY + PPUCTRL NT bits の直接適用で十分
- OAM DMA / スプライト描画への影響なし (スプライトはスクロール非連動)
- 既存テストが壊れないよう、scroll = 0 のデフォルト動作を維持

## 詰まったら

- nesdev wiki PPU scrolling: https://www.nesdev.org/wiki/PPU_scrolling
- nesdev wiki PPU nametables: https://www.nesdev.org/wiki/PPU_nametables
- nesdev wiki Mirroring: https://www.nesdev.org/wiki/Mirroring

30 分以上同じエラーで詰んだら stuck/ に隔離 → PR draft 戻し → セッション終了。
