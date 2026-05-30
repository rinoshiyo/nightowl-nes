# 夜 027: PPU 背景レンダリング基礎

## ゴール (/goal)

```
/goal night/027-ppu-bg-render ブランチで実装し、 nightly CI 緑、 PR が main に merge commit 完了、 nights/pending/027-ppu-bg-render.md が nights/done/ に移動済み、 or stop after 80 turns
```

完了時 transcript 必須出力: `🎯 GOAL CONDITION MET: night 027 merged`

## 前提

- 夜 026 done: PPU レジスタスタブ、NES Bus、Console 骨格が実装済み
- nestest 全 8991 行完走 (CPU は完成)
- Ppu クラスにレジスタ I/O (ctrl/mask/status/scroll/addr/data) + VRAM/OAM/palette が存在
- NesConsole.step() が CPU 1 命令を実行し cycle 数を返す
- CHR RAM (8KB)、VRAM (2KB)、パレット (32 bytes)、OAM (256 bytes) は Ppu 内に確保済み

## ブランチ運用

`night/027-ppu-bg-render` ブランチで実装、完了時に PR を立てる。main 直 push は hook で deny。

## 設計概要

### NTSC PPU タイミング (nesdev wiki 正典)

- 1 フレーム = 262 スキャンライン × 341 ドット (PPU サイクル)
- スキャンライン 0-239: 可視ライン (実際の描画)
- スキャンライン 240: ポストレンダー (idle)
- スキャンライン 241-260: VBlank 期間
- スキャンライン 261: プリレンダーライン
- VBlank 開始: スキャンライン 241、ドット 1 で PPUSTATUS bit7 セット → NMI 生成 (PPUCTRL bit7 有効時)
- VBlank 終了: プリレンダーライン (261)、ドット 1 で PPUSTATUS bit7/bit6/bit5 クリア
- PPU:CPU = 3:1 (CPU 1 cycle = PPU 3 dots)

### 背景タイル取得 (1 タイル = 8 dots の fetch サイクル)

可視ラインの dots 1-256 + 321-336 でタイル fetch を実行:
- dot N+0: ネームテーブル byte fetch (どのタイルか)
- dot N+2: アトリビュート byte fetch (どのパレットか)
- dot N+4: パターンテーブル lo byte fetch
- dot N+6: パターンテーブル hi byte fetch

各 8 dots で 1 タイル分の背景データを取得する。

### ネームテーブルアドレス計算

`$2000 + (vramAddr & 0x0FFF)` でネームテーブルの 1 byte (タイル番号) を取得。

### アトリビュートテーブルアドレス計算

`$23C0 + (vramAddr & 0x0C00) + ((vramAddr >> 4) & 0x38) + ((vramAddr >> 2) & 0x07)`

### パターンテーブルアドレス

PPUCTRL bit4 で背景パターンテーブル選択 (0=$0000, 1=$1000)。
アドレス = `base + tileNumber * 16 + fineY`

### この夜のスコープ

- PPU tick (dot/scanline カウンタ、フレーム完了検出)
- VBlank/NMI シグナリング
- 背景タイル fetch (基本取得パイプライン、スクロールなし)
- 256×240 フレームバッファへのピクセル出力
- NES パレットカラー (RGB テーブル)
- NesConsole の CPU-PPU 同期 (CPU 1 cycle = PPU 3 dots)
- スクロールは次の夜に回す (coarseX/coarseY/fineX/fineY はスコープ外)

## サブゴール

1. **G1: PPU タイミングエンジン** — Ppu に dot/scanline カウンタ、tick() メソッド。1 tick = 1 PPU dot。262 × 341 ドットでフレーム完了フラグ
2. **G2: VBlank + NMI** — スキャンライン 241/dot 1 で VBlank セット、261/dot 1 でクリア。NMI コールバック通知
3. **G3: 背景タイル取得パイプライン** — 可視ライン中にネームテーブル/アトリビュート/パターン lo/hi を fetch。CHR RAM から読み出し
4. **G4: ピクセルレンダリング** — 256×240 framebuffer (Uint8Array) に NES カラーインデックス出力。パレット参照で 2bpp → カラーインデックス変換
5. **G5: NES パレットカラーテーブル** — 64 色 RGB ルックアップテーブル (nesdev wiki 標準パレット)
6. **G6: Console CPU-PPU 同期** — NesConsole.step() で CPU cycle × 3 回 PPU tick。フレーム完了判定
7. **G7: ユニットテスト** — PPU タイミング、VBlank/NMI、タイル fetch、ピクセル出力の各テスト

## 実装ステップ

1. `git checkout main && git pull`
2. `git checkout -b night/027-ppu-bg-render`
3. G1: Ppu に dot/scanline/frameComplete + tick() を追加
4. G2: tick() 内で VBlank 処理 + NMI コールバック
5. G3: 可視ラインの fetch パイプライン
6. G4: ピクセルレンダリングロジック + framebuffer
7. G5: `src/core/palette.ts` に NES RGB パレットテーブル
8. G6: NesConsole.step() を CPU-PPU 同期に改修
9. G7: テスト追加
10. `bun test` 全 pass / `bunx tsc --noEmit` 警告ゼロ / `bunx eslint` 警告ゼロ
11. `git mv nights/pending/027-ppu-bg-render.md nights/done/027-ppu-bg-render.md`
12. `git push -u origin night/027-ppu-bg-render`
13. `gh pr create`
14. `code-review --fix` → triage → 全 PASS なら merge

## 検証チャンネル

- テスト pass: `✅ PASS: <test_name>`
- テスト fail: `❌ FAIL: <reason>`
- 型チェック: `✅ TYPECHECK: clean`
- PR 作成: `🔀 PR OPENED: <URL>`
- main merge 確認: `🎯 GOAL CONDITION MET: night 027 merged`

## 実装上の注意

- PPU tick() は 1 ドット単位 (cycle-accurate にしない「まず動かす」方針だが、スキャンライン単位ではなくドット単位で進める ← fetch パイプラインがドットに依存)
- NMI はコールバック関数で Console に通知 (Console が CPU.nmi() を呼ぶ)
- framebuffer は `Uint8Array(256 * 240)` でカラーインデックスを格納。RGB 変換は別レイヤー (ブラウザ描画時)
- スクロール関連 (fine scroll、coarseX/Y increment、水平/垂直リセット) は次の夜に回す
- fetch パイプラインは PPUCTRL の背景パターンテーブル選択 (bit4) を参照
- アトリビュートテーブルの 2bit パレット選択は (coarseX / coarseY) に基づく
- パレットミラーリング ($3F10/$3F14/$3F18/$3F1C → $3F00/$3F04/$3F08/$3F0C) は既に Ppu.writeVram() で対応済み
- nestest trace テストは変更なし (TRACE_LINES = 8991 を維持)

## コミット粒度 (Conventional Commits)

- `feat(core/ppu): PPU タイミングエンジン (dot/scanline カウンタ + tick)`
- `feat(core/ppu): VBlank + NMI シグナリング`
- `feat(core/ppu): 背景タイル取得パイプライン`
- `feat(core/ppu): ピクセルレンダリング + framebuffer`
- `feat(core): NES パレットカラーテーブル`
- `refactor(core): Console CPU-PPU 同期`
- `test(core/ppu): PPU タイミング・VBlank・背景レンダリングテスト`
- `chore(nights): 027 を done に移動`

最低 5 commit。

## DoD (完了条件)

- [ ] `night/027-ppu-bg-render` ブランチで作業
- [ ] Ppu に dot (0-340) プロパティが存在する
- [ ] Ppu に scanline (0-261) プロパティが存在する
- [ ] Ppu に frameComplete フラグが存在する
- [ ] Ppu.tick() が 1 ドット進め、341 ドットで scanline を進め、262 ラインでフレーム完了
- [ ] スキャンライン 241 / ドット 1 で PPUSTATUS bit7 (VBlank) をセット
- [ ] VBlank セット時に PPUCTRL bit7 が立っていれば NMI コールバックを呼ぶ
- [ ] プリレンダーライン (261) / ドット 1 で PPUSTATUS bit7/bit6/bit5 をクリア
- [ ] 可視ライン (0-239) で背景タイルのネームテーブル byte を fetch
- [ ] 可視ラインで背景タイルのアトリビュート byte を fetch
- [ ] 可視ラインでパターンテーブル lo/hi byte を fetch (PPUCTRL bit4 でテーブル選択)
- [ ] fetch したタイルデータからピクセルの 2bit カラーインデックスを算出
- [ ] アトリビュートから 2bit パレット番号を取得し、カラーインデックスと合わせて 4bit パレットエントリを構成
- [ ] パレット RAM 参照で最終カラーインデックス (0-63) を取得
- [ ] 256×240 framebuffer (Uint8Array) にカラーインデックスを出力
- [ ] カラーインデックス 0 (BG color) はパレット $3F00 を参照
- [ ] `src/core/palette.ts` に NES 標準パレット (64 色 RGB) テーブルが存在
- [ ] NesConsole.step() が CPU cycle × 3 回 PPU.tick() を呼ぶ
- [ ] NesConsole に NMI ハンドラが接続され、PPU NMI → CPU NMI が動作
- [ ] NesConsole にフレーム完了判定メソッドが存在
- [ ] PPU tick テスト: 341 dots で scanline が進むことを検証
- [ ] PPU VBlank テスト: 正しいタイミングで PPUSTATUS bit7 がセット/クリアされることを検証
- [ ] PPU NMI テスト: PPUCTRL bit7 有効時のみ NMI コールバックが呼ばれることを検証
- [ ] PPU BG fetch テスト: 既知のタイルデータを CHR RAM に配置し、正しいピクセルが framebuffer に出ることを検証
- [ ] パレットテスト: カラーインデックスから RGB 値が取得できることを検証
- [ ] `bun test` 全 pass
- [ ] `bunx tsc --noEmit` 警告ゼロ
- [ ] `bunx eslint 'src/**/*.ts' 'tests/**/*.ts' --max-warnings 0` 警告ゼロ
- [ ] git log に最低 5 commit
- [ ] `nights/pending/027-ppu-bg-render.md` を `nights/done/` に `git mv`
- [ ] PR が立っており merge commit で main に反映済み

## 詰まったら (nesdev wiki のみ参照)

- https://www.nesdev.org/wiki/PPU_rendering (PPU レンダリング全体像)
- https://www.nesdev.org/wiki/PPU_scrolling (スクロール — 次の夜だが fetch アドレス計算の参考)
- https://www.nesdev.org/wiki/PPU_pattern_tables (パターンテーブル)
- https://www.nesdev.org/wiki/PPU_nametables (ネームテーブル)
- https://www.nesdev.org/wiki/PPU_attribute_tables (アトリビュートテーブル)
- https://www.nesdev.org/wiki/PPU_palettes (パレット)
- https://www.nesdev.org/wiki/PPU_frame_timing (フレームタイミング)

30 分以上同じエラーで詰んだら stuck/ に隔離 → PR draft 戻し → セッション終了。
