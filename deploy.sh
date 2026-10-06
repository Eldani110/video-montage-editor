#!/usr/bin/env bash
# Redeploys the current HEAD to the VPS (https://videomontageeditor.thisoftcore.com)
# Usage: ./deploy.sh   (commit your changes first: only committed files are sent)
set -euo pipefail

VPS="root@187.33.154.249"
PORT=3001
DIR="/root/video-montage-editor"

echo "📦 Enviando $(git rev-parse --short HEAD) al VPS..."
git archive --format=tar HEAD | ssh -p "$PORT" "$VPS" "mkdir -p $DIR && tar -x -C $DIR"

echo "🐳 Reconstruyendo contenedor..."
ssh -p "$PORT" "$VPS" "cd $DIR && docker-compose up -d --build && docker image prune -f --filter label=stage=build >/dev/null"

echo "✅ Listo: https://videomontageeditor.thisoftcore.com"
