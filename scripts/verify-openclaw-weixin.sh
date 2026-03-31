#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_DIR="${ROOT_DIR}/plugins/openclaw-weixin"
METADATA_PATH="${ROOT_DIR}/plugins/openclaw-weixin.snapshot.json"
TAG="${1:-$(node -p "require('${METADATA_PATH}').tag")}"
REPOSITORY="${2:-$(node -p "require('${METADATA_PATH}').repository")}"

if [[ ! -d "${LOCAL_DIR}" ]]; then
  echo "Local snapshot directory does not exist: ${LOCAL_DIR}" >&2
  exit 1
fi

if [[ ! -f "${METADATA_PATH}" ]]; then
  echo "Snapshot metadata file does not exist: ${METADATA_PATH}" >&2
  exit 1
fi

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

echo "Verifying ${LOCAL_DIR} against ${REPOSITORY} @ ${TAG}"

git clone --depth 1 --branch "${TAG}" "${REPOSITORY}" "${TMP_DIR}/upstream" >/dev/null 2>&1

diff -ru \
  --exclude '.git' \
  --exclude '.DS_Store' \
  --label "local plugins/openclaw-weixin" \
  --label "git ${REPOSITORY}@${TAG}" \
  "${LOCAL_DIR}" \
  "${TMP_DIR}/upstream"

echo "Verified: local snapshot matches ${REPOSITORY}@${TAG}"
