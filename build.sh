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

  echo "Building default frontend..."
  (
    cd "${ROOT_DIR}/web/default"
    DISABLE_ESLINT_PLUGIN=true VITE_REACT_APP_VERSION="${VERSION}" bun run build
  )

  echo "Building classic frontend..."
  ensure_classic_date_fns_alias
  (
    cd "${ROOT_DIR}/web/classic"
    VITE_REACT_APP_VERSION="${VERSION}" bun run build
  )
}

ensure_classic_date_fns_alias() {
  local semi_foundation_dir=""
  local date_fns_dir="${ROOT_DIR}/web/node_modules/@douyinfe/semi-foundation/node_modules/date-fns"

  semi_foundation_dir="$(find "${ROOT_DIR}/web/node_modules/.bun" -path "*/node_modules/@douyinfe/semi-foundation" -type d -print -quit)"
  if [[ ! -d "${date_fns_dir}" ]]; then
    date_fns_dir="$(find "${ROOT_DIR}/web/node_modules/.bun" -path "*/date-fns@2*/node_modules/date-fns" -type d -print -quit)"
  fi

  if [[ -z "${semi_foundation_dir}" || ! -d "${date_fns_dir}" ]]; then
    return
  fi

  mkdir -p "${semi_foundation_dir}/node_modules"
  if [[ -L "${semi_foundation_dir}/node_modules/date-fns" || ! -e "${semi_foundation_dir}/node_modules/date-fns" ]]; then
    ln -sfn "${date_fns_dir}" "${semi_foundation_dir}/node_modules/date-fns"
  fi
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
