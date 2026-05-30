# 夜 028: ブラウザ描画層 (Canvas 2D + ROM ロード + ゲームループ)

## ゴール (/goal)

```
/goal night/028-browser-render ブランチで実装し、 nightly CI 緑、 PR が main に merge commit 完了、 nights/pending/028-browser-render.md が nights/done/ に移動済み、 or stop after 80 turns
```

完了時 transcript 必須出力: `🎯 GOAL CONDITION MET: night 028 merged`

## 前提

- 夜 027 done: PPU 背景レンダリング基礎が動作
- NesConsole.stepFrame() で 1 フレーム分実行し framebuffer (256×240 NES カラーインデックス) が出力される
- NES_PALETTE (64 色 RGB) テーブルが存在
- Vite 設定済み (root: src/browser, outDir: dist, server port 5173)
- `src/browser/` ディレクトリは未作成

## ブランチ運用

`night/028-browser-render` ブランチで実装、完了時に PR を立てる。main 直 push は hook で deny。

## 設計概要

### ブラウザ側の最小構成

1. **index.html** — Canvas 要素 + ROM ファイル入力
2. **main.ts** — エントリポイント。ROM ロード → NesConsole 初期化 → ゲームループ開始
3. **renderer.ts** — Canvas 2D API で framebuffer → ImageData → canvas に描画

### ゲームループ

- `requestAnimationFrame` で 60fps (NTSC) ループ
- 毎フレーム: `console.stepFrame()` → framebuffer を canvas に描画
- ROM 未ロード時は描画しない

### ROM ロード

- `<input type="file">` で .nes ファイルを選択
- FileReader で ArrayBuffer → Uint8Array → parseINes → NesConsole 初期化
- ロード完了でゲームループ開始

### framebuffer → Canvas 変換

- NesConsole.ppu.framebuffer (Uint8Array, カラーインデックス) → NES_PALETTE で RGB 変換 → ImageData → canvas.putImageData
- Canvas サイズは 256×240 (CSS で拡大は可能だが最小実装では原寸)

## サブゴール

1. **G1: HTML + エントリポイント** — `src/browser/index.html` と `src/browser/main.ts`。Canvas 要素、ファイル入力、基本レイアウト
2. **G2: Renderer** — `src/browser/renderer.ts`。framebuffer → ImageData → Canvas 2D 描画
3. **G3: ROM ロード + Console 初期化** — ファイル入力 → parseINes → NesConsole 生成
4. **G4: ゲームループ** — requestAnimationFrame で stepFrame + render を 60fps 駆動
5. **G5: Vite ビルド確認** — `npm run build` で dist/ に正しくビルドされることを確認

## 実装ステップ

1. `git checkout main && git pull`
2. `git checkout -b night/028-browser-render`
3. G1: `src/browser/index.html` + `src/browser/main.ts` 作成
4. G2: `src/browser/renderer.ts` 作成
5. G3: ROM ロードロジック実装
6. G4: ゲームループ実装
7. G5: `bun test` + `bunx tsc --noEmit` + `bunx eslint` + `npm run build`
8. `git mv nights/pending/028-browser-render.md nights/done/028-browser-render.md`
9. `git push -u origin night/028-browser-render`
10. `gh pr create`
11. `code-review --fix` → triage → 全 PASS なら merge

## 検証チャンネル

- テスト pass: `✅ PASS: <test_name>`
- 型チェック: `✅ TYPECHECK: clean`
- ビルド成功: `✅ BUILD: dist/ 生成完了`
- PR 作成: `🔀 PR OPENED: <URL>`
- main merge 確認: `🎯 GOAL CONDITION MET: night 028 merged`

## 実装上の注意

- `src/browser/` は DOM API を使うブラウザ専用コード。`src/core/` からのインポートのみ許可
- Canvas 2D の `putImageData` は毎フレーム呼ぶ (WebGL は不要、まず動かす方針)
- ImageData の RGBA 配列は NES_PALETTE の RGB + alpha=255 で構成
- エラーハンドリング: parseINes が throw した場合はアラート表示
- テストは core 側のみ (browser 側は DOM 依存のため Vitest では難しい。手動確認)
- nestest trace テストは変更なし (TRACE_LINES = 8991 を維持)
- ESLint: src/browser/ のファイルも lint 対象に含める

## コミット粒度 (Conventional Commits)

- `feat(browser): HTML + Canvas エントリポイント`
- `feat(browser): framebuffer → Canvas 2D レンダラー`
- `feat(browser): ROM ロード + NesConsole 初期化`
- `feat(browser): requestAnimationFrame ゲームループ`
- `chore(nights): 028 を done に移動`

最低 4 commit。

## DoD (完了条件)

- [ ] `night/028-browser-render` ブランチで作業
- [ ] `src/browser/index.html` が存在し Canvas 要素とファイル入力を含む
- [ ] `src/browser/main.ts` がエントリポイントとして Vite に認識される
- [ ] `src/browser/renderer.ts` が framebuffer → Canvas 2D 描画を行う
- [ ] NES_PALETTE を使ってカラーインデックス → RGBA 変換
- [ ] `<input type="file">` で .nes ファイルを選択し ROM ロードできる
- [ ] parseINes で iNES ヘッダを解析し NesConsole を初期化できる
- [ ] requestAnimationFrame で stepFrame + render が毎フレーム実行される
- [ ] ROM 未ロード時はゲームループが走らない (or 描画しない)
- [ ] parseINes エラー時にユーザーにフィードバック
- [ ] `npm run build` で dist/ にビルド成果物が生成される
- [ ] `bun test` 全 pass
- [ ] `bunx tsc --noEmit` 警告ゼロ
- [ ] `bunx eslint 'src/**/*.ts' 'tests/**/*.ts' --max-warnings 0` 警告ゼロ
- [ ] git log に最低 4 commit
- [ ] `nights/pending/028-browser-render.md` を `nights/done/` に `git mv`
- [ ] PR が立っており merge commit で main に反映済み

## 詰まったら

- Vite + TypeScript の設定は vite.config.ts を参照
- Canvas 2D API: https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API
- ImageData: https://developer.mozilla.org/en-US/docs/Web/API/ImageData

30 分以上同じエラーで詰んだら stuck/ に隔離 → PR draft 戻し → セッション終了。
