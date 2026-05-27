#!/bin/bash
# Mint a short-lived GitHub App installation access token, printed to stdout.
#
# Used to post review comments under the App's bot identity
# (e.g. "nightowl-reviewer[bot]") instead of the human gh account, so reviewer
# comments are visually distinguishable from the user's own comments.
#
# Usage:
#   GH_TOKEN="$(scripts/gh-app-token.sh)" gh pr comment <n> --body "..."
#
# Config (env overridable):
#   GH_APP_CLIENT_ID  GitHub App client id (JWT issuer; NOT a secret)
#   GH_APP_KEY        path to the App private key PEM (the secret; kept out of git)
#   GH_APP_REPO       owner/repo the App is installed on
#
# The private key is read from a path inside the container. Provide it either via
# the compose mount (${HOME}/.local/keys -> /home/node/.local/keys, persistent)
# or a gitignored path like tmp/bot-key.pem (override with GH_APP_KEY) for a quick
# test before the container is rebuilt.
set -euo pipefail

# Config is read straight from the environment. In normal use these are injected
# into the container by the compose override (env_file: .env), so no in-script
# .env parsing is needed. For an ad-hoc run, export the vars yourself first.
: "${GH_APP_CLIENT_ID:?set GH_APP_CLIENT_ID (compose override injects it via env_file: .env)}"
: "${GH_APP_KEY:?set GH_APP_KEY (compose override injects it via env_file: .env)}"
CLIENT_ID="$GH_APP_CLIENT_ID"
KEY="$GH_APP_KEY"
REPO="${GH_APP_REPO:-rinoshiyo/nightowl-nes}"

[ -f "$KEY" ] || { echo "gh-app-token: private key not found: $KEY" >&2; exit 1; }

b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }

now=$(date +%s)
header=$(printf '{"alg":"RS256","typ":"JWT"}' | b64url)
# iat backdated 60s for clock skew tolerance; exp 9 min (GitHub max is 10).
payload=$(printf '{"iat":%d,"exp":%d,"iss":"%s"}' "$((now - 60))" "$((now + 540))" "$CLIENT_ID" | b64url)
sig=$(printf '%s' "${header}.${payload}" | openssl dgst -sha256 -sign "$KEY" -binary | b64url)
jwt="${header}.${payload}.${sig}"

# Resolve the installation on the target repo (works with an App JWT).
inst_id=$(curl -fsS -H "Authorization: Bearer ${jwt}" -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/${REPO}/installation" | jq -r '.id // empty')
[ -n "$inst_id" ] || { echo "gh-app-token: no installation found for ${REPO}" >&2; exit 1; }

# Exchange the JWT for a 1-hour installation access token.
token=$(curl -fsS -X POST -H "Authorization: Bearer ${jwt}" -H "Accept: application/vnd.github+json" \
  "https://api.github.com/app/installations/${inst_id}/access_tokens" | jq -r '.token // empty')
[ -n "$token" ] || { echo "gh-app-token: failed to mint installation token" >&2; exit 1; }

printf '%s\n' "$token"
