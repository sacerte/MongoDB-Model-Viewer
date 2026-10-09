#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -d node_modules ]; then
  npm install
fi

npm run desktop:dist:linux:arch

ls -1 release/*.pkg.tar.zst 2>/dev/null || {
  echo "No se generó ningún instalador Arch (.pkg.tar.zst) en la carpeta release/." >&2
  exit 1
}
