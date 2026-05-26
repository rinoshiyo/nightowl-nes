# nightowl-nes devcontainer
# ベース: TypeScript + Node.js 24 (bookworm)
FROM mcr.microsoft.com/devcontainers/typescript-node:4-24-bookworm

# apt パッケージ (gh, jq は CLAUDE.md 既定の運用前提)
RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
       gh \
       jq \
       ca-certificates \
       curl \
       git \
       unzip \
  && rm -rf /var/lib/apt/lists/*

# vscode ユーザ (uid 1000) は base image で用意済み
USER vscode
WORKDIR /home/vscode

# Bun をユーザ環境にインストール
RUN curl -fsSL https://bun.sh/install | bash \
  && echo 'export PATH="$HOME/.bun/bin:$PATH"' >> /home/vscode/.bashrc \
  && /home/vscode/.bun/bin/bun --version

ENV PATH="/home/vscode/.bun/bin:${PATH}"

# Claude Code CLI (devcontainer 内で claude 起動できるように)
USER root
RUN npm install -g @anthropic-ai/claude-code
USER vscode

# git 既定設定: push --force を物理的に困難に
RUN git config --global push.default current \
 && git config --global push.followTags false \
 && git config --global push.autoSetupRemote false

WORKDIR /workspace/nightowl-nes
