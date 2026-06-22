#!/bin/sh
# Single entrypoint for both Railway services from one image/config.
# RUN_MODE=worker  -> the BullMQ worker (scheduled publish + webinar jobs)
# otherwise        -> the Next.js web server
set -e

if [ "$RUN_MODE" = "worker" ]; then
  echo "Clovion CMS: starting WORKER (RUN_MODE=worker)"
  exec pnpm worker
else
  echo "Clovion CMS: starting WEB on port ${PORT:-3000}"
  exec pnpm start
fi
