#!/usr/bin/env bash
set -euo pipefail

# Lightweight setup script for new machines.
# - checks node version and suggests using nvm/volta
# - runs pnpm install
# - installs Playwright browsers (user-level). Use --with-deps to also install OS deps (requires sudo).
# - configures git hooks

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

USAGE="Usage: ./scripts/setup.sh [--with-deps]"
WITH_DEPS=0
if [[ ${1-} == "--with-deps" ]]; then
  WITH_DEPS=1
fi

echo "Project setup: $ROOT_DIR"

# check node
if command -v node >/dev/null 2>&1; then
  NODE_VER=$(node -v | sed 's/^v//')
  echo "Found node $NODE_VER"
else
  echo "No node found. Recommended: use nvm or Volta to install Node 20+."
  echo "If you use nvm, run: curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.6/install.sh | bash"
  echo "Then: nvm install 20 && nvm use 20"
  exit 1
fi

echo "Installing node_modules (pnpm install)..."
pnpm install

echo "Installing Playwright browsers (user-level)..."
if [ "$WITH_DEPS" -eq 1 ]; then
  echo "Installing OS dependencies (requires sudo)..."
  sudo apt-get update && sudo apt-get install -y \
    libnss3 libxss1 libasound2 libatk1.0-0 libatk-bridge2.0-0 libcups2 libx11-6 libxcomposite1 libxrandr2 libxdamage1 libgbm1 libxshmfence1 libgtk-3-0 xvfb
  npx playwright install --with-deps chromium
else
  if ! npx playwright install chromium; then
    echo ""
    echo "⚠️  Playwright browser installation failed."
    echo "   If you see errors about missing libraries, try:"
    echo "     ./scripts/setup.sh --with-deps"
    echo ""
    exit 1
  fi
fi

echo "Configuring git hooks..."
git config core.hooksPath .githooks || true

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "  pnpm run dev    # Start development server"
echo "  pnpm test       # Run all tests"
echo ""
