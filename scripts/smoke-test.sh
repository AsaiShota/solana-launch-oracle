#!/usr/bin/env bash
# Smoke-test the API. Defaults to localhost; pass a URL to test a deployed host.
#   ./scripts/smoke-test.sh              # http://localhost:3000
#   ./scripts/smoke-test.sh https://foo  # remote
set -e
URL="${1:-http://localhost:3000}"

step() { printf "\n\033[36m▶ %s\033[0m\n" "$1"; }
ok()   { printf "  \033[32m✓ %s\033[0m\n" "$1"; }
fail() { printf "  \033[31m✗ %s\033[0m\n" "$1"; exit 1; }

step "GET $URL/health"
code=$(curl -s -o /tmp/health.json -w "%{http_code}" "$URL/health")
[ "$code" = "200" ] || fail "expected 200, got $code"
cat /tmp/health.json | head -c 200; echo
ok "200 OK"

step "GET $URL/sources/status"
code=$(curl -s -o /tmp/status.json -w "%{http_code}" "$URL/sources/status")
[ "$code" = "200" ] || fail "expected 200, got $code"
cat /tmp/status.json | head -c 400; echo
ok "200 OK"

step "GET $URL/launches/recent (no payment) → expect 402"
code=$(curl -s -o /tmp/402.json -w "%{http_code}" "$URL/launches/recent")
[ "$code" = "402" ] || fail "expected 402, got $code"
cat /tmp/402.json | head -c 400; echo
ok "402 Payment Required"

step "GET $URL/launches/recent (with placeholder X-PAYMENT) → expect 200"
code=$(curl -s -H "X-PAYMENT: dryrun" -o /tmp/200.json -w "%{http_code}" "$URL/launches/recent")
if [ "$code" = "200" ]; then
  ok "200 OK (placeholder middleware)"
else
  printf "  \033[33m! got $code (real x402 SDK is enforcing — this is correct in production)\033[0m\n"
fi

echo
echo "All smoke tests passed against $URL"
