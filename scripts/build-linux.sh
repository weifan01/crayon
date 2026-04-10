#!/bin/bash
# 使用 Docker 构建 Linux 版本 (支持 macOS/Windows 跨平台构建)

set -e

VERSION=${VERSION:-"v1.0.2"}
LDFLAGS=${LDFLAGS:-"-s -w"}

# 更新 wails.json 中的版本
if [ -f "wails.json" ]; then
    echo "🔄 Updating wails.json productVersion to $VERSION"
    if sed --version >/dev/null 2>&1; then
        sed -i 's/"productVersion": "[^"]*"/"productVersion": "'"$VERSION"'"/' wails.json
    else
        sed -i '' 's/"productVersion": "[^"]*"/"productVersion": "'"$VERSION"'"/' wails.json
    fi
fi

echo "🐳 Building Linux AMD64 using Docker..."

mkdir -p dist/linux

docker run --rm \
  --platform=linux/amd64 \
  -v "$(pwd)":/app \
  -w /app \
  -e CGO_ENABLED=1 \
  -e VERSION="$VERSION" \
  golang:1.22-bookworm \
  /bin/bash -c '
    set -e
    sed -i "s/deb.debian.org/mirrors.tuna.tsinghua.edu.cn/g" /etc/apt/sources.list.d/debian.sources && \
	apt-get update && apt install -y \
      nodejs \
      npm \
      build-essential \
      libgtk-3-dev \
      libwebkit2gtk-4.0-dev \
      && rm -rf /var/lib/apt/lists/*
    go install github.com/wailsapp/wails/v2/cmd/wails@latest
    cd frontend && npm install && cd ..
    wails build -platform linux/amd64 -o dist/linux/crayon-$VERSION-linux-amd64 -ldflags "'"$LDFLAGS"'"
  '

echo "✅ Linux build complete: dist/linux/crayon-$VERSION-linux-amd64"

echo "📦 Creating tarball..."
cd dist/linux && tar -czvf crayon-"$VERSION"-linux-amd64.tar.gz crayon-"$VERSION"-linux-amd64

echo "✅ Package ready: dist/linux/crayon-$VERSION-linux-amd64.tar.gz"