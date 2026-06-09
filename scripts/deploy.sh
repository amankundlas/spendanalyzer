#!/bin/bash
# Deploy to the minipc: push to GitHub, then pull + rebuild on the minipc.
# Usage: ./scripts/deploy.sh [branch]   (default: main)
set -e

REMOTE="minipc"
APP_DIR="/home/aman/spendanalyzer"
BRANCH="${1:-main}"

echo "Pushing to origin/$BRANCH..."
git push origin "$BRANCH"

echo "Deploying on the minipc..."
ssh "$REMOTE" "set -e
  cd '$APP_DIR'
  # reset --hard is safe here: .env is gitignored, so it survives the reset
  git fetch origin && git reset --hard \"origin/$BRANCH\"
  if [ ! -f .env ]; then
    echo 'ERROR: .env missing on minipc. Run ./scripts/bootstrap-minipc.sh first.' >&2
    exit 1
  fi
  docker compose -f docker-compose.yml -f docker-compose.minipc.yml up -d --build
"

# Read the published port straight from the remote .env (grep, not source, so a
# malformed value can't execute or be silently swallowed); default to 8090.
PORT="$(ssh "$REMOTE" "grep -E '^FRONTEND_PORT=' '$APP_DIR/.env' | tail -n1 | cut -d= -f2-")"
echo "Deployed: http://192.168.0.100:${PORT:-8090}"
