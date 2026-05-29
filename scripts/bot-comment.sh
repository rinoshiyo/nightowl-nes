#!/bin/bash
# bot 名義 (rinoshiyo-bot-reviewer[bot]) で PR にコメントを投稿する集約ラッパー。
#
# レビュー結果コメントを必ず bot 名義で残すための唯一の経路。生の `gh pr comment` /
# `gh api ... comments` を直接叩くと、トークン適用漏れで石井名義に静かに fallback したり、
# `gh pr comment` に `--jq` を付けて投稿失敗したりする事故が起きるため、それらをここで
# 構造的に防ぐ:
#   1. bot トークンを必ず適用。取得できなければ fail-stop (石井名義への fallback を許さない)
#   2. 投稿は `gh api` に統一 (`gh pr comment` の --jq 非対応の落とし穴を回避)
#   3. 投稿後に author を検証し、bot 名義でなければ非0 で落とす (名義漏れの構造的検出)
#
# usage:
#   bot-comment.sh <pr> <body>                         # issue comment (サマリ・証跡)
#   bot-comment.sh <pr> --inline <path> <line> <body>  # inline review comment
#
# body は引数で渡す (改行・suggestion ブロック・絵文字可)。例:
#   bash scripts/bot-comment.sh 45 "$(cat <<'EOF'
#   ✨ レビューしました！...
#   EOF
#   )"
set -uo pipefail

PR="${1:?usage: bot-comment.sh <pr> [--inline <path> <line>] <body>}"
shift

TOKEN=$(bash "$(dirname "${BASH_SOURCE[0]}")/gh-app-token.sh" 2>/dev/null || true)
if [ -z "$TOKEN" ]; then
  echo "ERROR: bot トークン取得失敗 (鍵未マウント?)。石井名義への fallback を避けるため投稿中止。" >&2
  exit 1
fi

REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null)
if [ -z "$REPO" ]; then
  echo "ERROR: リポジトリ特定失敗 (gh repo view)。" >&2
  exit 1
fi

if [ "${1:-}" = "--inline" ]; then
  path_arg="${2:?--inline には <path> <line> <body> が必要}"
  line="${3:?--inline には <path> <line> <body> が必要}"
  body="${4:?--inline には <path> <line> <body> が必要}"
  # gh は -F line をローカル検証しないため、非数値を渡すと API が 422 を返す。
  # 構造的に弾く (このラッパーの目的は誤投稿の防止)。
  case "$line" in
    ''|*[!0-9]*) echo "ERROR: --inline の <line> は正の整数で指定してください (line=$line)。" >&2; exit 1 ;;
  esac
  # メインの HEAD がレビュー対象ブランチを指す保証がない (CORE.md は finder に checkout 禁止を
  # 指示) ため、PR head の sha を API から引く。
  sha=$(GH_TOKEN="$TOKEN" gh api "repos/$REPO/pulls/$PR" -q .head.sha 2>/dev/null)
  if [ -z "$sha" ]; then
    echo "ERROR: PR #$PR の head sha 取得失敗。" >&2
    exit 1
  fi
  resp=$(GH_TOKEN="$TOKEN" gh api "repos/$REPO/pulls/$PR/comments" \
    -f body="$body" -f commit_id="$sha" -f path="$path_arg" -F line="$line" -f side=RIGHT 2>&1) \
    || { echo "ERROR: inline 投稿失敗 (API): $resp" >&2; exit 1; }
else
  body="${1:?body required}"
  resp=$(GH_TOKEN="$TOKEN" gh api "repos/$REPO/issues/$PR/comments" \
    -f body="$body" 2>&1) \
    || { echo "ERROR: issue comment 投稿失敗 (API): $resp" >&2; exit 1; }
fi

# 投稿の HTTP 成否 (上の `||`) と名義検証を分離する。投稿成功レスポンスから login を
# 後段で抽出 (--jq を投稿と同段にすると「投稿失敗」と「名義漏れ」が同じ exit に潰れる)。
login=$(printf '%s' "$resp" | jq -r '.user.login // empty' 2>/dev/null)

# 投稿者が bot であることを検証 (名義漏れの構造的検出)。
case "$login" in
  *"[bot]") echo "posted as $login (PR #$PR)" ;;
  *) echo "ERROR: bot 名義で投稿されなかった (login=$login)。トークンが効いていない疑い。" >&2; exit 1 ;;
esac
