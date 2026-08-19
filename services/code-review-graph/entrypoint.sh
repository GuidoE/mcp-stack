#!/usr/bin/env bash
# ============================================================
# entrypoint.sh  —  code-review-graph container
# Clones/mirrors GIT_REPO_URL read-only, builds the graph, then
# serves it over MCP Streamable HTTP. Refreshes on an interval
# via git pull + incremental update (not a working tree anyone
# edits — this is a read-only mirror for graph queries only).
# ============================================================
set -euo pipefail

REPO_DIR="/app/repo"
PORT="${MCP_PORT:-3003}"
REFRESH_SECONDS="${REFRESH_SECONDS:-300}"
GIT_REPO_URL="${GIT_REPO_URL:-git@github.com:the-real-bojangles/telos.git}"
DEPLOY_KEY="/run/secrets/crg_telos_deploy_key"

if [ ! -f "${DEPLOY_KEY}" ]; then
  echo "==> ${DEPLOY_KEY} not mounted, refusing to start" >&2
  exit 1
fi
chmod 600 "${DEPLOY_KEY}"
export GIT_SSH_COMMAND="ssh -i ${DEPLOY_KEY} -o StrictHostKeyChecking=accept-new -o IdentitiesOnly=yes"

if [ ! -d "${REPO_DIR}/.git" ]; then
  echo "==> Cloning ${GIT_REPO_URL} ..." >&2
  git clone --depth 1 "${GIT_REPO_URL}" "${REPO_DIR}"
else
  echo "==> Repo already present, pulling latest" >&2
  git -C "${REPO_DIR}" pull --ff-only
fi

echo "==> Building initial graph" >&2
code-review-graph build --repo "${REPO_DIR}"

refresh_loop() {
  while true; do
    sleep "${REFRESH_SECONDS}"
    echo "==> Refreshing $(date -u +%FT%TZ)" >&2
    if git -C "${REPO_DIR}" pull --ff-only; then
      code-review-graph update --repo "${REPO_DIR}" || echo "==> update failed, will retry next cycle" >&2
    else
      echo "==> git pull failed, will retry next cycle" >&2
    fi
  done
}

refresh_loop &

echo "==> Serving MCP over HTTP on 0.0.0.0:${PORT}" >&2
exec code-review-graph serve --repo "${REPO_DIR}" --http --host 0.0.0.0 --port "${PORT}"
