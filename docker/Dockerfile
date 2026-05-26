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

# vscode ユーザ (uid 1000) は base image で用意済み
USER vscode
WORKDIR /home/vscode

# Bun をユーザ環境にインストール
RUN curl -fsSL https://bun.sh/install | bash \
  && echo 'export PATH="$HOME/.bun/bin:$PATH"' >> /home/vscode/.bashrc \
  && /home/vscode/.bun/bin/bun --version

ENV PATH="/home/vscode/.bun/bin:${PATH}"

# claude-tmux を ct で呼べるように alias
RUN echo "alias ct='claude-tmux'" >> /home/vscode/.bashrc

# Claude Code CLI (devcontainer 内で claude 起動できるように)
USER root
RUN npm install -g @anthropic-ai/claude-code
USER vscode

# git の安全弁は ~/.gitconfig を compose.yaml で ro mount している前提。
# push --force / main 直 push 等は .claude/hooks/pre-tool-use.sh で deny する
# (devcontainer 内 git config --global で設定しても ~/.gitconfig mount で上書きされるため)

WORKDIR /workspace/nightowl-nes
