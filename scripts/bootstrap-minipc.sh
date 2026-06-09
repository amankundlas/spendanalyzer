#!/bin/bash
# One-time minipc setup: clone repo and create .env. Safe to re-run (idempotent).
# Run from the Mac: ./scripts/bootstrap-minipc.sh
set -e

REMOTE="minipc"
APP_DIR="/home/aman/spendanalyzer"
REPO="https://github.com/amankundlas/spendanalyzer.git"

ssh "$REMOTE" "set -e
  if [ ! -d '$APP_DIR/.git' ]; then
    git clone '$REPO' '$APP_DIR'
  fi
  cd '$APP_DIR'
  if [ ! -f .env ]; then
    cp .env.example .env
    echo 'Created .env from .env.example on the minipc.'
  else
    echo '.env already exists on the minipc — left unchanged.'
  fi
"
echo 'Bootstrap complete.'
