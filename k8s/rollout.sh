#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROLLOUT_TIMEOUT="${ROLLOUT_TIMEOUT:-180s}"

kubectl apply -f "${SCRIPT_DIR}/kahoot.yaml"

kubectl -n kahoot rollout restart deployment/kahoot-backend
kubectl -n kahoot rollout restart deployment/kahoot-frontend

kubectl -n kahoot rollout status deployment/kahoot-backend --timeout="${ROLLOUT_TIMEOUT}"
kubectl -n kahoot rollout status deployment/kahoot-frontend --timeout="${ROLLOUT_TIMEOUT}"
