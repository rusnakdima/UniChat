#!/bin/bash

# Build UniChat as a Flatpak. Usage: ./build.sh [build|no-build]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

BUILD_TAURI="${1:-build}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

if [ "$BUILD_TAURI" != "build" ] && [ "$BUILD_TAURI" != "no-build" ]; then
	echo -e "${RED}Error: Invalid build option '$BUILD_TAURI'${NC}"
	echo "Usage: $0 [build|no-build]"
	exit 1
fi

if ! command -v flatpak &>/dev/null; then
	echo -e "${RED}Error: flatpak is not installed${NC}"
	exit 1
fi

if ! command -v flatpak-builder &>/dev/null; then
	echo -e "${RED}Error: flatpak-builder is not installed${NC}"
	exit 1
fi

APP_ID="com.tcs.unichat"
MANIFEST="${APP_ID}.yml"
BUILD_DIR="./build"
REPO_DIR="./repo"

echo -e "${YELLOW}Step 1: Installing required runtimes...${NC}"
flatpak remote-add --user --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo || true
flatpak install -y --user flathub org.gnome.Platform//49 org.gnome.Sdk//49 || true

if [ "$BUILD_TAURI" = "build" ]; then
	if ! command -v bun &>/dev/null; then
		echo -e "${RED}Error: bun is required to build the Tauri app${NC}"
		exit 1
	fi
	echo -e "${YELLOW}Step 2: Building Tauri (no bundle)...${NC}"
	cd ..
	bun run tauri:build:fast
	cd "$SCRIPT_DIR"
else
	echo -e "${YELLOW}Skipping Tauri build; using existing binary under ../src-tauri/target/release${NC}"
fi

echo -e "${YELLOW}Step 3: Building Flatpak...${NC}"
flatpak-builder \
	--disable-cache \
	--force-clean \
	--user \
	--install-deps-from=flathub \
	--repo="${REPO_DIR}" \
	"${BUILD_DIR}" \
	"${MANIFEST}"

echo -e "${YELLOW}Step 4: Creating Flatpak bundle...${NC}"
flatpak build-bundle "${REPO_DIR}" "${APP_ID}.flatpak" "${APP_ID}"
echo -e "${GREEN}=== Build complete: ${APP_ID}.flatpak ===${NC}"
