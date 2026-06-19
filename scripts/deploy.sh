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
  docker compose -f docker-compose.yml -f docker-compose.minipc.yml build --pull
  docker compose -f docker-compose.yml -f docker-compose.minipc.yml up -d
  # The watched-folder bind mount (./import) is auto-created by Docker as root;
  # chown it (from inside the root api container) to the host user so files can
  # be dropped in from the host. Idempotent.
  docker compose -f docker-compose.yml -f docker-compose.minipc.yml exec -T api \\
    chown -R \"\$(id -u):\$(id -g)\" /import || true
  # Ensure the local LLM models are present (idempotent: 'ollama pull' is a no-op
  # if already downloaded). First run fetches ~5GB (7B) + ~2GB (3B); later deploys
  # are instant. The 7B handles categorization; the 3B handles the slower PDF
  # extraction so it finishes within the request timeout.
  MODEL=\$(grep -E '^OLLAMA_MODEL=' .env | tail -n1 | cut -d= -f2-)
  MODEL=\${MODEL:-qwen2.5:7b-instruct}
  EXTRACT_MODEL=\$(grep -E '^OLLAMA_EXTRACT_MODEL=' .env | tail -n1 | cut -d= -f2-)
  EXTRACT_MODEL=\${EXTRACT_MODEL:-qwen2.5:3b-instruct}
  CATEGORIZE_MODEL=\$(grep -E '^OLLAMA_CATEGORIZE_MODEL=' .env | tail -n1 | cut -d= -f2-)
  CATEGORIZE_MODEL=\${CATEGORIZE_MODEL:-qwen2.5:3b-instruct}
  for m in \$(printf '%s\n' \"\$MODEL\" \"\$EXTRACT_MODEL\" \"\$CATEGORIZE_MODEL\" | sort -u); do
    echo \"Ensuring Ollama model present: \$m\"
    docker compose -f docker-compose.yml -f docker-compose.minipc.yml exec -T llm ollama pull \"\$m\"
  done
"

# Read the published port straight from the remote .env (grep, not source, so a
# malformed value can't execute or be silently swallowed); default to 8090.
PORT="$(ssh "$REMOTE" "grep -E '^FRONTEND_PORT=' '$APP_DIR/.env' | tail -n1 | cut -d= -f2-")"
echo "Deployed: http://192.168.0.100:${PORT:-8090}"
