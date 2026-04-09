#!/bin/bash
# 使用 Docker 构建 Linux 版本

set -e

echo "🐳 Building Linux version using Docker..."

# 构建临时 Docker 镜像
docker build -t crayon-builder -f Dockerfile.build .

# 运行构建容器
docker run --rm \
    -v "$(pwd):/app" \
    -v "$(pwd)/dist:/app/dist" \
    crayon-builder

echo "✅ Linux build complete: dist/linux/"