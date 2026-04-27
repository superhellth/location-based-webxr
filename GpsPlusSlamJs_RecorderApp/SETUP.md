# Setup Guide

This document describes how to set up the GpsPlusSlamJs Recorder App for development.

## Prerequisites

- **Node.js 20+** (see `.nvmrc`)
- **npm 10+**
- **Chrome Android 142+** for testing on device (WebXR + File System Access)

## Quick Start

```bash
# Clone and navigate to the recorder app
cd GpsPlusSlamJs_RecorderApp

# Install dependencies
npm ci

# Run the dev server
npm run dev

# Run tests
npm test
```

## Automated Setup

For a complete setup including Playwright browsers:

```bash
./scripts/setup.sh

# Or with OS-level dependencies (requires sudo)
./scripts/setup.sh --with-deps
```

## Git Hooks

The project includes a pre-push hook that runs `npm test` before allowing pushes. To enable:

```bash
git config core.hooksPath .githooks
```

## VS Code

Recommended extensions are listed in `.vscode/extensions.json`. VS Code should prompt you to install them on first open.

## Testing on Android

1. Connect your Android phone via USB with USB debugging enabled
2. Open `chrome://inspect` in Chrome on your computer
3. Forward port 5173 to your phone
4. Navigate to `http://localhost:5173` on your phone's Chrome
5. Alternatively, use `ngrok` to expose the dev server with HTTPS (required for WebXR in production)

## Troubleshooting

### WebXR not available

- Ensure you're using Chrome on Android
- WebXR requires HTTPS in production (localhost is exempt)
- Check `chrome://flags` for WebXR-related flags

### File System Access API not available

- Requires Chrome Android 142+
- Feature may be behind a flag on older versions

### Playwright tests failing

```bash
# Reinstall Playwright browsers
npx playwright install chromium

# With OS dependencies
npx playwright install --with-deps chromium
```
