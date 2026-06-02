# nightowl-nes

Claude Code が夜間自走で TypeScript スクラッチ実装する NES エミュレータ。 vibe coding 実験プロジェクト。

> **これは何か**: 主目的は「Claude Code が `/goal` 駆動でどこまで独走できるか」を観察すること。 動く NES エミュレータは副産物。

## 設計書

- `docs/design.md` — 設計書 v2 (全 10 部 + Appendix)
- `docs/design.html` — 同上 HTML 版

## デモ

https://rinoshiyo.github.io/nightowl-nes/

main ブランチへの merge で GitHub Pages に自動デプロイされる。

## 動かす (devcontainer 前提)

```bash
# VS Code: コマンドパレット → "Dev Containers: Reopen in Container"
# devcontainer 内ターミナルで:
cd /workspace/nightowl-nes
bun install
bun test
bun run build   # dist/ にビルド成果物
```

## 自走起動

devcontainer 内で:

```bash
claude --permission-mode bypassPermissions
# 開いた claude セッションで /loop-start を実行
```

## ライセンス

MIT (予定)。 ゲーム ROM は同梱しない (`roms/games/` は `.gitignore`)。 テスト ROM は [christopherpow/nes-test-roms](https://github.com/christopherpow/nes-test-roms) を submodule 参照。
