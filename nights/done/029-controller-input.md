# 夜 029: コントローラ入力 ($4016/$4017 + キーボードマッピング)

## ゴール (/goal)

```
/goal night/029-controller-input ブランチで実装し、 nightly CI 緑、 PR が main に merge commit 完了、 nights/pending/029-controller-input.md が nights/done/ に移動済み、 or stop after 80 turns
```

完了時 transcript 必須出力: `🎯 GOAL CONDITION MET: night 029 merged`

## 前提

- 夜 028 done: ブラウザ描画層が動作 (Canvas 2D + ROM ロード + ゲームループ)
- NesConsole.stepFrame() で 1 フレーム分実行し framebuffer が出力される
- NES Bus ($4016/$4017) は現在 apuIo 配列で汎用的にハンドリングされている
- コントローラ関連のクラス/ロジックは未実装

## ブランチ運用

`night/029-controller-input` ブランチで実装、完了時に PR を立てる。main 直 push は hook で deny。

## 設計概要

### NES コントローラプロトコル (nesdev wiki)

- $4016 write: bit0 = strobe。1→0 の立ち下がりでボタン状態をラッチ
- $4016 read: 1 回の read ごとに 1 ボタン分 (bit0) を返す。順序: A, B, Select, Start, Up, Down, Left, Right
- 8 回 read で全ボタン取得。9 回目以降は 1 を返す (公式コントローラ)
- Player 2 は $4017 (同じプロトコル)。まず Player 1 のみ実装

### コア層 (src/core/)

1. **Controller クラス** — ボタン状態 (8bit) を保持し、strobe/read プロトコルを実装
   - `setButtons(state: number): void` — 外部からボタン状態を設定
   - `write(value: number): void` — $4016 write (strobe 制御)
   - `read(): number` — $4016 read (シリアル読み出し)
2. **NES Bus 配線** — $4016/$4017 の read/write を Controller に委譲

### ブラウザ層 (src/browser/)

3. **キーボードマッピング** — keydown/keyup イベントで Controller.setButtons を更新
   - デフォルトマッピング: Arrow keys (方向), Z (A), X (B), Enter (Start), Shift (Select)

## サブゴール

1. **G1: Controller クラス** — `src/core/controller.ts`。strobe/read プロトコル
2. **G2: NES Bus 配線** — $4016 read/write を Controller に委譲
3. **G3: Console 統合** — NesConsole に Controller を持たせ、NES Bus に渡す
4. **G4: キーボード入力** — `src/browser/main.ts` で keydown/keyup → Controller.setButtons
5. **G5: テスト** — Controller の strobe/read プロトコルの単体テスト

## 実装ステップ

1. `git checkout main && git pull`
2. `git checkout -b night/029-controller-input`
3. G1: `src/core/controller.ts` 作成
4. G2: `src/core/nes-bus.ts` に Controller 配線
5. G3: `src/core/console.ts` に Controller 統合
6. G5: `tests/controller.test.ts` 作成
7. G4: `src/browser/main.ts` にキーボード入力追加
8. `bun test` + `bunx tsc --noEmit` + `bunx eslint`
9. `git mv nights/pending/029-controller-input.md nights/done/029-controller-input.md`
10. `git push -u origin night/029-controller-input`
11. `gh pr create`
12. `code-review --fix` → triage → 全 PASS なら merge

## 検証チャンネル

- テスト pass: `✅ PASS: <test_name>`
- 型チェック: `✅ TYPECHECK: clean`
- PR 作成: `🔀 PR OPENED: <URL>`
- main merge 確認: `🎯 GOAL CONDITION MET: night 029 merged`

## 実装上の注意

- Controller はコア層 (`src/core/`) に置く。DOM API への依存禁止
- キーボードマッピングはブラウザ層 (`src/browser/`) で Controller.setButtons を呼ぶ形
- Player 2 は今回スコープ外 (Controller クラスは汎用的に作るが、配線は Player 1 のみ)
- nestest trace テストは変更なし (TRACE_LINES = 8991 を維持)
- $4017 はこの夜では APU ステータスとしては使わない (コントローラ P2 ポートとしてのみ)

## コミット粒度 (Conventional Commits)

- `feat(core): Controller クラス (strobe/read プロトコル)`
- `feat(core): NES Bus $4016 に Controller 配線`
- `feat(browser): キーボード入力 → Controller マッピング`
- `test(core): Controller strobe/read テスト`
- `chore(nights): 029 を done に移動`

最低 4 commit。

## DoD (完了条件)

- [ ] `night/029-controller-input` ブランチで作業
- [ ] `src/core/controller.ts` が存在し Controller クラスを export
- [ ] Controller が strobe (write $4016 bit0) → ラッチ → シリアル read プロトコルを実装
- [ ] setButtons() でボタン状態 (8bit) を外部から設定できる
- [ ] 8 回 read で A,B,Select,Start,Up,Down,Left,Right の順に取得
- [ ] 9 回目以降の read は 1 を返す
- [ ] NES Bus の $4016 read/write が Controller に委譲されている
- [ ] NesConsole が Controller を保持し NES Bus に渡している
- [ ] ブラウザ側で keydown/keyup がコントローラボタンにマッピングされている
- [ ] Controller の strobe/read プロトコルテストが pass
- [ ] `bun test` 全 pass
- [ ] `bunx tsc --noEmit` 警告ゼロ
- [ ] `bunx eslint 'src/**/*.ts' 'tests/**/*.ts' --max-warnings 0` 警告ゼロ
- [ ] git log に最低 4 commit
- [ ] `nights/pending/029-controller-input.md` を `nights/done/` に `git mv`
- [ ] PR が立っており merge commit で main に反映済み

## 詰まったら

- nesdev wiki: https://www.nesdev.org/wiki/Standard_controller
- $4016/$4017 の動作: https://www.nesdev.org/wiki/Controller_reading

30 分以上同じエラーで詰んだら stuck/ に隔離 → PR draft 戻し → セッション終了。
