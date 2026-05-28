---
name: loop-start
description: nightowl-nes の /clear 自走ループを開始する。pending の夜を1本ずつ、夜境界で /clear して context をリセットしながら自律連鎖で消化する。tmux + bypassPermissions 前提。
---

# /clear 自走ループ起動

対話型セッションを維持したまま、夜境界で `/clear` して context をリセットしながら
`nights/pending/` の夜を自律連鎖で消化するループを開始する。
駆動機構 (Stop hook + helper + clear restore) は `.claude/hooks/` に実装済み。
詳細は CLAUDE.md「自走連鎖プロトコル > /clear 自走ループ駆動」を参照。

## 前提チェック (満たさなければ理由を述べて中断)

1. tmux pane 内で起動していること: `echo "${TMUX_PANE:-NONE}"` が `%` 付き ID を返す
   (フックは pane スコープのフラグ前提。NONE ならループは機能しない)
2. bypassPermissions で動いていること (各夜が無人で進むため)
3. `git checkout main && git pull` で最新化済みで、`nights/pending/` に夜 md が1つ以上ある

## ループの回り方 (1 夜 = 1 サイクル)

1. fresh session が CLAUDE.md + 再注入された `.claude/state/latest.md` を読む
2. `nights/pending/` 最若の夜を `night/NNN-<topic>` ブランチで実装
3. PR 作成 → sub-agent レビュー → triage (STOP/FIX/PASS) → 全 PASS なら auto-merge arm
4. **各夜の終了処理** (CLAUDE.md 参照) を必ず実行:
   - handoff を PR に書く
   - `bash scripts/finish-night.sh "<次ゴール文 or STOP>"` を呼ぶ（auto-merge arm / latest.md / フラグ書込 / GOAL 出力を一括実行）
5. turn を終える → Stop hook が helper を spawn → `/clear` → latest.md 再注入 → 次ゴール投入 → 次の夜へ

暴走ブレーキは `NIGHTOWL_LOOP_MAX` (既定 20)。低くしたい場合は worker 起動時に環境変数で設定。

## いま実行すること

上記の前提チェックを行い、満たしていれば **最初の 1 夜**に着手せよ。
その夜の「各夜の終了処理」でフラグを書けば、以降は `/clear` 連鎖で無人継続する。
途中で `nights/pending/` が空になったら CLAUDE.md「Claude が次の夜 md を起こす責務」に従い、
seed するか `STOP` を書くかを判断すること。
