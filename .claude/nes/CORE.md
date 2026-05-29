# NES プロジェクト domain (nes CORE・毎セッション必読)

> このリポ固有の**中身**。`loop/CORE.md` の機構が「契約」を定義するのに対し、ここは「達成条件・レビュー観点・技術前提」という NES 固有の中身を定義する。plugin には切り出さない。
> CLAUDE.md から `@import` され毎セッション必ずロードされる。

## 技術スタック

- TypeScript (strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes)
- ランタイム: Bun
- ブラウザビルド: Vite
- テスト: Vitest (or bun test)
- 描画: Canvas 2D API
- 音声: Web Audio API
- 配布: GitHub Pages (main 自動 deploy)

## 達成条件 (各夜の DoD の土台)

各夜は以下を満たして「達成」とする (`loop/CORE.md` の /goal 出力ルールでマーカーを出す):

- `bun test` 全 pass
- `bunx tsc --noEmit` 警告ゼロ
- `bunx eslint 'src/**/*.ts' 'tests/**/*.ts' --max-warnings 0` 警告ゼロ
- nestest trace test (`TRACE_LINES`) が当該夜の実装範囲まで延伸して pass
- DoD 各項目を満たす (夜 md に記載)

## レビュー観点 (code-review の finder に渡す NES 固有の観点)

`loop/CORE.md` の「夜 N PR の自動レビュー」で、 メインが直呼びする code-review の finder に渡る観点:

1. **6502 仕様との一致性** (nesdev wiki が正典): opcode・cycle 数・フラグ挙動が仕様通りか
2. **TypeScript 型安全性** (`noUncheckedIndexedAccess` / `exactOptionalPropertyTypes` 下で破綻なし)
3. **テストカバレッジの妥当性** (フラグ境界・overflow・borrow 等のエッジ)
4. **既存 NES 実装の参照疑い** (下記ソース由来制約違反の痕跡)

## コード配置・設計方針

- **コアロジックは `src/core/` に書き、 DOM API は `src/browser/` にのみ書く**
- **cycle-accurate に拘らない**、 まずは動かす
- commit メッセージは Conventional Commits 形式

## ソース由来制約 (重要・critical)

本リポは vibe coding のスクラッチ実装が目的。 **既存 NES エミュレータ実装のソースコードは参照禁止**。

### 参照 OK

- nesdev.org/wiki/* (NES 仕様の公開ドキュメント、 CC ライセンス)
- 6502 命令仕様書 (パブリックドメイン)
- iNES / NES2.0 ヘッダ仕様
- 自分のリポ内コード (submodule の christopherpow/nes-test-roms 含む)

### 参照 NG

既存 NES エミュレータの実装ソースコードはどんな言語でも、 どんなライセンスでも見ない。 コードスニペット引用も禁止。 該当リポ (deny list は `.claude/hooks/pre-tool-use.sh` で構造的に強制):

- bfirsh/jsnes / fogleman/nes / amhndu/SimpleNES / SourMesen/Mesen / SourMesen/Mesen2 / AndreaOrru/LaiNES / koute/pinky / spieglt/nestur / daniel5151/ANESE / nwidger/nintengo / scottferg/Fergulator / Amjad50/plastic / bugzmanov/nes_ebook (Rust コード部分) / OneLoneCoder/olcNES / TASEmulators/fceux

### 参考にしてよい抽象レベル

- アーキ思想 (Console.Step() の協調構造、 Mapper を interface で切り替える等)
- 仕様書から導出できる一般概念

困った時は **nesdev wiki に戻る**。 既存実装を覗かない。
