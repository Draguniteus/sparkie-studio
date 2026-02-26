#!/bin/sh
set -e

export NEXT_TELEMETRY_DISABLED=1

# Start a minimal health-check server on port 3000 immediately
# so DO's readiness probe passes while next build runs
node -e "
const http = require('http');
const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('ok');
});
server.listen(process.env.PORT || 3000, () => {
  console.log('[health-stub] listening on port', process.env.PORT || 3000);
});
process.on('SIGTERM', () => server.close());
" &
HEALTH_PID=$!

echo '[start.sh] running next build...'
npm run build

echo '[start.sh] build complete, killing health stub...'
kill $HEALTH_PID 2>/dev/null || true

echo '[start.sh] starting next start...'
exec npx next start -p "${PORT:-3000}"
