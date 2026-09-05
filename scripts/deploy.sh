#!/bin/sh
# Build in the container, push the bundle to the dev HA server (plan v0.1
# deploy loop). Requires the Terminal & SSH add-on on the server.
set -e
cd "$(dirname "$0")/.."
docker compose run --rm node npm run build
scp dist/room-climate-card.js root@homeassistant.local:/config/www/
echo "Deployed /config/www/room-climate-card.js — hard-refresh the dashboard,"
echo "or bump the ?v= suffix on the /local/room-climate-card.js resource."
