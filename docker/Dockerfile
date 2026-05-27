# nightowl-nes devcontainer
# ベース: TypeScript + Node.js 24 (bookworm)
FROM mcr.microsoft.com/devcontainers/typescript-node:4-24-bookworm

# apt パッケージ (gh, jq は CLAUDE.md 既定の運用前提、 tmux は claude-tmux ラッパー用)
RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
       gh \
       jq \
       tmux \
       ca-certificates \
       curl \
       git \
       unzip \
  && rm -rf /var/lib/apt/lists/*

# claude-tmux ラッパー (永続化された tmux セッションで claude 起動するためのスクリプト)
COPY bin/claude-tmux /usr/local/bin/claude-tmux
RUN chmod +x /usr/local/bin/claude-tmux

# node ユーザ (uid 1000) は base image で用意済み
USER node
WORKDIR /home/node

# Bun をユーザ環境にインストール
RUN curl -fsSL https://bun.sh/install | bash \
  && echo 'export PATH="$HOME/.bun/bin:$PATH"' >> /home/node/.bashrc \
  && /home/node/.bun/bin/bun --version

ENV PATH="/home/node/.bun/bin:${PATH}"

# claude-tmux を ct で呼べるように alias
RUN echo "alias ct='claude-tmux'" >> /home/node/.bashrc

# Claude Code CLI: 公式ネイティブインストーラで導入。
# npm global は container 環境で auto-update が失敗する (npm のバージョン管理と競合 +
# 権限) ため、公式推奨のネイティブインストーラに切替。~/.local/bin に node 権限で
# 入る = root 切替不要。auto-update は有効のまま (実行時に最新へ、更新時は再ビルド)。
RUN curl -fsSL https://claude.ai/install.sh | bash \
  && echo 'export PATH="$HOME/.local/bin:$PATH"' >> /home/node/.bashrc \
  && /home/node/.local/bin/claude --version
ENV PATH="/home/node/.local/bin:${PATH}"

# git の安全弁は ~/.gitconfig を compose.yaml で ro mount している前提。
# push --force / main 直 push 等は .claude/hooks/pre-tool-use.sh で deny する
# (devcontainer 内 git config --global で設定しても ~/.gitconfig mount で上書きされるため)

WORKDIR /workspace/nightowl-nes
