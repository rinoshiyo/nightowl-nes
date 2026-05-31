# 夜 030: PPU スプライト描画 + OAM DMA

## ゴール (/goal)

```
/goal night/030-sprite-rendering ブランチで実装し、 nightly CI 緑、 PR が main に merge commit 完了、 nights/pending/030-sprite-rendering.md が nights/done/ に移動済み、 or stop after 80 turns
```

完了時 transcript 必須出力: `🎯 GOAL CONDITION MET: night 030 merged`

## 前提

- 夜 029 done: コントローラ入力が動作
- PPU は背景描画 (nametable + attribute + pattern) が実装済み
- OAM レジスタ ($2003/$2004) は PPU に実装済み、OAM は 256 バイト確保済み
- VBlank / NMI / PPUCTRL / PPUMASK / PPUSTATUS は実装済み
- スプライト描画・OAM DMA ($4014) は未実装
- nestest trace は全 8991 行完走済み (TRACE_LINES 変更なし)

## ブランチ運用

`night/030-sprite-rendering` ブランチで実装、完了時に PR を立てる。main 直 push は hook で deny。

## 設計概要

### OAM DMA ($4014)

- CPU が $4014 に値 N を write → CPU ページ $NN00-$NNFF の 256 バイトを PPU OAM にコピー
- DMA 中は CPU が halt する (513 or 514 サイクル消費)
- NES Bus の write ハンドラで実装。Bus.read() で元データを読み、PPU.oam[] に書き込む
- 仕様参照: https://www.nesdev.org/wiki/PPU_OAM#DMA

### スプライト評価 (per scanline)

- 各可視スキャンラインの開始時、OAM 64 エントリから現スキャンラインに重なるスプライトを検索
- 1 スプライト = 4 バイト: [Y座標, タイルIndex, Attribute, X座標]
- 1 スキャンラインに最大 8 スプライトを選出 (secondary OAM)
- 9 個目以降が見つかったら $2002 bit5 (sprite overflow) をセット
- 仕様参照: https://www.nesdev.org/wiki/PPU_sprite_evaluation

### スプライト描画 (8×8 モード)

- PPUCTRL bit3 でスプライトパターンテーブルベースを選択 (0: $0000, 1: $1000)
- 各スプライトの attribute:
  - bit0-1: パレット番号 (パレット $11-$13, $15-$17, $19-$1B, $1D-$1F)
  - bit5: priority (0=スプライトが前面, 1=背景が前面)
  - bit6: X flip (水平反転)
  - bit7: Y flip (垂直反転)
- 透明ピクセル (パレットインデックス 0) は描画しない

### スプライト 0 ヒット

- $2002 bit6: スプライト 0 の非透明ピクセルが背景の非透明ピクセルと重なったときセット
- X=255 ではヒットしない
- 背景描画またはスプライト描画が無効のときはヒットしない
- フレーム開始 (pre-render line) でクリア

### 描画優先度

- OAM のインデックスが小さいほど優先度が高い (sprite 0 が最優先)
- 同一ピクセルに複数スプライトが重なる場合、最小インデックスのスプライトが勝つ
- priority bit で背景より前か後ろかを制御

## サブゴール

1. **G1: OAM DMA** — NES Bus $4014 write → OAM へ 256 バイト転送。サイクル消費を NesConsole に通知
2. **G2: スプライト評価** — PPU にスキャンラインごとのスプライト選出ロジック (secondary OAM 構築)
3. **G3: スプライト描画** — パターンテーブルから 8×8 タイルを fetch し framebuffer に描画。flip・palette・priority 処理
4. **G4: スプライト 0 ヒット + overflow** — $2002 bit6/bit5 の判定ロジック
5. **G5: テスト** — OAM DMA / スプライト評価 / 描画 / sprite 0 hit / overflow のテスト

## 実装ステップ

1. `git checkout main && git pull`
2. `git checkout -b night/030-sprite-rendering`
3. G1: `src/core/nes-bus.ts` に $4014 DMA ハンドラ追加 + Console 側のサイクル加算
4. G2: `src/core/ppu.ts` にスプライト評価 (evaluateSprites) 追加
5. G3: `src/core/ppu.ts` にスプライト描画 (renderSpritePixel) 追加、tickVisible 統合
6. G4: sprite 0 hit / overflow フラグ判定
7. G5: `tests/ppu_sprite.test.ts` 作成
8. `bun test` + `bunx tsc --noEmit` + `bunx eslint`
9. `git mv nights/pending/030-sprite-rendering.md nights/done/030-sprite-rendering.md`
10. `git push -u origin night/030-sprite-rendering`
11. `gh pr create`
12. `code-review --fix` → triage → 全 PASS なら merge

## 検証チャンネル

- テスト pass: `✅ PASS: <test_name>`
- 型チェック: `✅ TYPECHECK: clean`
- PR 作成: `🔀 PR OPENED: <URL>`
- main merge 確認: `🎯 GOAL CONDITION MET: night 030 merged`

## 実装上の注意

- スプライトロジックは全てコア層 (`src/core/ppu.ts`) に実装。DOM 依存禁止
- 8×16 スプライトモード (PPUCTRL bit5) は今回スコープ外。8×8 のみ実装
- OAM DMA のサイクル消費は NesConsole.step() の戻り値に加算する形で実装
- PPU の tickVisible() を拡張し、背景描画後にスプライトピクセルを合成
- secondary OAM (スキャンラインごとの最大 8 スプライト) は Uint8Array(32) で持つ
- nestest trace テストは変更なし (TRACE_LINES = 8991 を維持)
- パレットミラーリング: スプライトパレットは $3F10/$3F14/$3F18/$3F1C が $3F00/$3F04/$3F08/$3F0C にミラー (既存実装で対応済み)

## コミット粒度 (Conventional Commits)

- `feat(core): OAM DMA ($4014) 実装`
- `feat(core): PPU スプライト評価 (per scanline)`
- `feat(core): PPU スプライト描画 (8×8 + flip + priority)`
- `feat(core): sprite 0 hit + sprite overflow フラグ`
- `test(core): PPU スプライト描画テスト`
- `chore(nights): 030 を done に移動`

最低 5 commit。

## DoD (完了条件)

- [ ] `night/030-sprite-rendering` ブランチで作業
- [ ] NES Bus $4014 write で OAM DMA が実行される
- [ ] DMA は CPU ページ $NN00-$NNFF の 256 バイトを PPU OAM にコピー
- [ ] DMA 中に 513 サイクル (奇数サイクル開始時は 514) が消費される
- [ ] PPU がスキャンラインごとに OAM を走査し、重なるスプライトを最大 8 個選出する
- [ ] 9 個目のスプライトが見つかったら $2002 bit5 (sprite overflow) がセットされる
- [ ] PPUCTRL bit3 でスプライトパターンテーブルベース ($0000/$1000) が切り替わる
- [ ] スプライトの attribute bit0-1 でパレット ($3F11-$3F13 等) が選択される
- [ ] スプライトの attribute bit5 で背景との前後関係が制御される
- [ ] スプライトの attribute bit6 で水平反転 (X flip) が機能する
- [ ] スプライトの attribute bit7 で垂直反転 (Y flip) が機能する
- [ ] 透明ピクセル (カラーインデックス 0) のスプライトピクセルは描画されない
- [ ] OAM インデックスが小さいスプライトが優先 (同一ピクセルで勝つ)
- [ ] sprite 0 の非透明ピクセルと背景の非透明ピクセルが重なったとき $2002 bit6 がセットされる
- [ ] X=255 では sprite 0 hit は発生しない
- [ ] 背景描画 (mask bit3) またはスプライト描画 (mask bit4) 無効時は sprite 0 hit は発生しない
- [ ] pre-render line (261) で sprite 0 hit と sprite overflow がクリアされる
- [ ] スプライト描画が PPUMASK bit4 で有効/無効制御される
- [ ] OAM DMA のテストが pass
- [ ] スプライト評価のテストが pass
- [ ] スプライト描画 (flip / priority / palette) のテストが pass
- [ ] sprite 0 hit 判定のテストが pass
- [ ] sprite overflow 判定のテストが pass
- [ ] `bun test` 全 pass
- [ ] `bunx tsc --noEmit` 警告ゼロ
- [ ] `bunx eslint 'src/**/*.ts' 'tests/**/*.ts' --max-warnings 0` 警告ゼロ
- [ ] nestest trace テスト pass (TRACE_LINES = 8991、変更なし)
- [ ] git log に最低 5 commit
- [ ] `nights/pending/030-sprite-rendering.md` を `nights/done/` に `git mv`
- [ ] PR が立っており merge commit で main に反映済み

## 詰まったら

- nesdev wiki PPU OAM: https://www.nesdev.org/wiki/PPU_OAM
- nesdev wiki sprite evaluation: https://www.nesdev.org/wiki/PPU_sprite_evaluation
- nesdev wiki rendering: https://www.nesdev.org/wiki/PPU_rendering

30 分以上同じエラーで詰んだら stuck/ に隔離 → PR draft 戻し → セッション終了。
