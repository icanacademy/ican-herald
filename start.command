#!/bin/bash

# ICAN Herald + Original Books - Start Script
# Launches the app and Cloudflare tunnels for both sites

cd "$(dirname "$0")"

# Kill any existing instances
pkill -f "node.*ican-herald/server.js" 2>/dev/null

echo "Starting ICAN Herald on port 4000..."
node server.js &
APP_PID=$!

sleep 1

if kill -0 $APP_PID 2>/dev/null; then
  echo "ICAN Herald is running (PID $APP_PID)"
  echo ""
  echo "  Local:            http://localhost:4000"
  echo ""
  echo "  Herald (public):  https://herald.icanacademy.work"
  echo "  Books (public):   https://studentbooks.icanacademy.work"
else
  echo "Failed to start ICAN Herald"
  exit 1
fi

echo ""
echo "Press Ctrl+C to stop"

trap "kill $APP_PID 2>/dev/null; echo ''; echo 'ICAN Herald stopped.'; exit 0" INT TERM
wait $APP_PID
