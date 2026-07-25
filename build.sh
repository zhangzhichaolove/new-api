#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_DIR="${ROOT_DIR}/build"
VERSION="$(tr -d '[:space:]' < "${ROOT_DIR}/VERSION")"
LDFLAGS="-s -w -X github.com/QuantumNous/new-api/common.Version=${VERSION}"
export TMPDIR="${TMPDIR:-${OUTPUT_DIR}/.tmp}"
export GOCACHE="${GOCACHE:-${OUTPUT_DIR}/.gocache}"

usage() {
  echo "Usage: $0 [all]" >&2
  exit 1
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Error: $1 is required but was not found in PATH." >&2
    exit 1
  fi
}

build_frontends() {
  echo "Installing frontend dependencies..."
  (
    cd "${ROOT_DIR}/web"
    bun install --frozen-lockfile
  )

  echo "Building frontend..."
  (
    cd "${ROOT_DIR}/web"
    DISABLE_ESLINT_PLUGIN=true VITE_REACT_APP_VERSION="${VERSION}" bun run build
  )
}

build_backend() {
  local goos="$1"
  local goarch="$2"
  local ext=""

  if [[ "${goos}" == "windows" ]]; then
    ext=".exe"
  fi

  local output="${OUTPUT_DIR}/new-api-${goos}-${goarch}${ext}"
  echo "Building backend ${goos}/${goarch} -> ${output}"
  rm -f "${output}"
  (
    cd "${ROOT_DIR}"
    GOOS="${goos}" GOARCH="${goarch}" CGO_ENABLED=0 go build -trimpath -ldflags "${LDFLAGS}" -o "${output}" .
  )

  echo "Compressing ${output} with UPX..."
  upx --best --lzma "${output}"
}

if [[ $# -gt 1 ]]; then
  usage
fi

targets=("linux/amd64")
if [[ "${1:-}" == "all" ]]; then
  targets=(
    "linux/amd64"
    "linux/arm64"
    "darwin/amd64"
    "darwin/arm64"
    "windows/amd64"
  )
elif [[ $# -eq 1 ]]; then
  usage
fi

require_command bun
require_command go
require_command upx

mkdir -p "${OUTPUT_DIR}" "${TMPDIR}" "${GOCACHE}"
build_frontends

for target in "${targets[@]}"; do
  IFS="/" read -r goos goarch <<< "${target}"
  build_backend "${goos}" "${goarch}"
done

echo "Build complete. Binaries are in ${OUTPUT_DIR}."
