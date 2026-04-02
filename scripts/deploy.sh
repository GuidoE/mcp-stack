#!/bin/bash
# deploy.sh — Pull latest config from GitHub and restart affected services
set -e

cd /opt/mcp-stack

echo "=== Pulling latest from GitHub ==="
git pull --ff-only

echo "=== Checking for Traefik static config changes ==="
if git diff HEAD~1 --name-only | grep -q "traefik/traefik.yml"; then
    echo "traefik.yml changed — restarting Traefik"
    docker restart traefik
else
    echo "traefik.yml unchanged — Traefik will hot-reload dynamic configs"
fi

echo "=== Checking for Docker Compose changes ==="
if git diff HEAD~1 --name-only | grep -q "docker-compose.yml"; then
    echo "docker-compose.yml changed — running docker compose up"
    docker compose up -d
else
    echo "docker-compose.yml unchanged"
fi

echo "=== Deploy complete ==="
git log --oneline -1
