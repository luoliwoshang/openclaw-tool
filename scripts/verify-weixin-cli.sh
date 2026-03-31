#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_DIR="${ROOT_DIR}/tools/weixin-cli"
PACKAGE_NAME="@tencent-weixin/openclaw-weixin-cli"
VERSION="${1:-$(node -p "require('${LOCAL_DIR}/package.json').version")}"

if [[ ! -d "${LOCAL_DIR}" ]]; then
  echo "Local snapshot directory does not exist: ${LOCAL_DIR}" >&2
  exit 1
fi

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

echo "Verifying ${LOCAL_DIR} against ${PACKAGE_NAME}@${VERSION}"

PACK_FILE="$(npm pack "${PACKAGE_NAME}@${VERSION}" --silent --pack-destination "${TMP_DIR}")"
EXTRACTED_DIR="${TMP_DIR}/npm-package"
mkdir -p "${EXTRACTED_DIR}"
tar -xzf "${TMP_DIR}/${PACK_FILE}" --strip-components=1 -C "${EXTRACTED_DIR}"

diff -ru \
  --exclude '.DS_Store' \
  --label "local tools/weixin-cli" \
  --label "npm ${PACKAGE_NAME}@${VERSION}" \
  "${LOCAL_DIR}" \
  "${EXTRACTED_DIR}"

echo "Verified: local snapshot matches ${PACKAGE_NAME}@${VERSION}"
