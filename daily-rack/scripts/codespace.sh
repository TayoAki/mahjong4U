#!/usr/bin/env bash
# Runs the API and the Expo dev server inside a GitHub Codespace so an iPhone with Expo Go
# can reach both. The phone is outside GitHub's network, so it can't see the Codespace's
# localhost: Metro (port 8081, the app's JavaScript) and the API (port 8787) both need a
# public URL.
#
#   npm run phone            Metro through the Codespace's own forwarded port (no extra account)
#   TUNNEL=1 npm run phone   Metro through Expo's tunnel instead (run `npx expo login` once first)
#   API_URL=https://daily-rack-production.up.railway.app npm run phone
#                            use the live server on Railway instead of starting one here
#
# Without API_URL, the API runs in the Codespace and goes through its forwarded port 8787.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -z "${CODESPACE_NAME:-}" ]]; then
  echo "This script is for GitHub Codespaces. On your own computer run:" >&2
  echo "  DEV_ROTATE=1 npm start" >&2
  echo "  cd apps/mobile && EXPO_PUBLIC_API_URL=http://<your-computer's-LAN-IP>:8787 npx expo start" >&2
  exit 1
fi

domain="${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
metro_url="https://${CODESPACE_NAME}-8081.${domain}"
ports="8081:public"

if [[ -n "${API_URL:-}" ]]; then
  api_url="${API_URL%/}"
  curl -sf -o /dev/null "$api_url/v1/config" || { echo "Can't reach $api_url" >&2; exit 1; }
else
  api_url="https://${CODESPACE_NAME}-8787.${domain}"
  ports="8787:public 8081:public"
  # The clip studio and shared links load the web build from the API server.
  [[ -f apps/mobile/dist/index.html ]] || npm run build

  DEV_ROTATE="${DEV_ROTATE:-1}" PUBLIC_BASE_URL="$api_url" npm start &
  server=$!
  trap 'kill "$server" 2>/dev/null || true' EXIT

  for _ in $(seq 1 60); do
    curl -sf -o /dev/null http://localhost:8787/v1/config && break
    sleep 1
  done
fi

# Public means anyone with the link can reach these ports while the Codespace is running.
make_public() {
  # shellcheck disable=SC2086
  gh codespace ports visibility $ports -c "$CODESPACE_NAME" >/dev/null 2>&1
}
if make_public; then
  echo "Made public: $ports"
else
  echo "Couldn't make the ports public automatically."
  echo "In the Ports tab, right-click each of these and choose Port Visibility > Public: ${ports//:public/}"
  # Metro's port may only be forwarded once it starts listening; try once more then.
  (sleep 20 && make_public && echo "Made public: $ports") &
fi

echo
echo "API and web app: $api_url"
echo "Scan the QR code below with the iPhone Camera to open the app in Expo Go."
echo

cd apps/mobile
export EXPO_PUBLIC_API_URL="$api_url"
if [[ "${TUNNEL:-}" == "1" ]]; then
  npx expo start --tunnel
else
  EXPO_PACKAGER_PROXY_URL="$metro_url" npx expo start
fi
