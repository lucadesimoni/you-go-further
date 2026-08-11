#!/bin/sh
# Container start-up, in the order that makes a bad deploy fail fast.
#
#   1. Write dist/config.js from the *runtime* environment, so this image tag
#      can be promoted from staging to production without a rebuild.
#   2. Hand over to the server, which runs the preflight itself and refuses to
#      listen if a production blocker is present.
#
# `exec` matters: it makes the server PID 1's direct child, so the SIGTERM an
# orchestrator sends during a rolling deploy reaches the graceful shutdown
# instead of a shell that ignores it.
set -e

node scripts/host-config.mjs

exec node --import tsx server/index.ts
