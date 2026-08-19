# ============================================================
# services/code-review-graph/Dockerfile
# code-review-graph — Tree-sitter code intelligence graph, served
# over MCP (Streamable HTTP) for the OC/Telos crew.
# Mirrors and graphs the-real-bojangles/telos read-only.
# ============================================================

FROM python:3.12-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates openssh-client \
 && rm -rf /var/lib/apt/lists/*

# Pinned: bump deliberately, verify release notes before bumping.
RUN pip install --no-cache-dir code-review-graph==2.3.7

WORKDIR /app

# Verified against docs.github.com's published SSH host key fingerprints
# on 2026-08-19 (see commit message) — avoids trust-on-first-connect.
COPY github_known_hosts /etc/ssh/ssh_known_hosts

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3003

ENTRYPOINT ["/entrypoint.sh"]
