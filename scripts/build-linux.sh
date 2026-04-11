#!/bin/bash
# 使用 Docker 构建 Linux 版本 (支持 macOS/Windows 跨平台构建)

set -e

VERSION=${VERSION:-"v1.0.0"}
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
  3070656869/wails-build:v0.0.1 \
  /bin/bash -c '
    set -e
    cd frontend && npm install && cd ..
    wails build -platform linux/amd64 -o crayon-$VERSION-linux-amd64 -ldflags "'"$LDFLAGS"'"
  '

echo "✅ Linux build complete: build/bin/dist/linux/crayon-$VERSION-linux-amd64"

echo "📦 Creating tarball..."
cd dist/linux && tar -czvf crayon-"$VERSION"-linux-amd64.tar.gz /app/build/bin/crayon-"$VERSION"-linux-amd64

echo "✅ Package ready: dist/linux/crayon-$VERSION-linux-amd64.tar.gz"