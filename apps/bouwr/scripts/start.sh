#!/bin/sh
set -eu
node --import tsx scripts/migrate.ts
exec node server.js
