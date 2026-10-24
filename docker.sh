#!/bin/sh
# Runs repro.mjs on Linux in the Playwright image (the freeze was only seen in
# Linux WebKit). Env vars are passed through, e.g.
#   ROUNDS=400 PRESSURE=1 ./docker.sh
#   ROUNDS=400 PRESSURE=1 NO_RELEASE_LOCK=1 ./docker.sh
# From Git Bash on Windows: MSYS_NO_PATHCONV=1 ./docker.sh
set -e
src="$(pwd -W 2>/dev/null || pwd)"
docker run --rm --init --ipc=host \
  -e ROUNDS -e CONCURRENCY -e PRESSURE -e NO_RELEASE_LOCK -e STOP_AFTER \
  -v "$src:/src:ro" \
  mcr.microsoft.com/playwright:v1.62.0-noble \
  sh -c 'mkdir /app && cd /src && tar --exclude=node_modules --exclude=dist -cf - . | tar -xf - -C /app && cd /app && npm install --no-audit --no-fund --loglevel=error && node repro.mjs'
