# Crayon Terminal - Makefile
# 多平台构建支持

# 版本信息
VERSION ?= v1.0.2
BUILD_TIME := $(shell date +%Y-%m-%d)
GIT_COMMIT := $(shell git rev-parse --short HEAD 2>/dev/null || echo "unknown")

# Go 参数
GOCMD=go
GOFLAGS=-v
LDFLAGS=-s -w -X "crayon/internal/version.Version=$(VERSION)" \
	-X "crayon/internal/version.BuildTime=$(BUILD_TIME)" \
	-X "crayon/internal/version.GitCommit=$(GIT_COMMIT)"

# Wails 命令
WAILS=wails

# 输出目录
BUILD_DIR=build/bin
DIST_DIR=dist

# 应用名称
APP_NAME=crayon
APP_DISPLAY_NAME=Crayon

# macOS 相关
MAC_APP_NAME=$(APP_DISPLAY_NAME).app
DMG_NAME=$(APP_NAME)-$(VERSION)-darwin

# ============================================
# 默认目标
# ============================================

.PHONY: all
all: dev

# ============================================
# 开发相关
# ============================================

.PHONY: dev
dev:
	$(WAILS) dev

.PHONY: dev-frontend
dev-frontend:
	cd frontend && npm run dev

.PHONY: dev-backend
dev-backend:
	$(GOCMD) run .

# ============================================
# 构建相关
# ============================================

.PHONY: build
build:
	$(WAILS) build -ldflags "$(LDFLAGS)"

.PHONY: build-release
build-release:
	$(WAILS) build -clean -upx -ldflags "$(LDFLAGS)"

# ============================================
# 跨平台构建
# ============================================

.PHONY: build-all
build-all: build-linux build-windows build-darwin
	@echo "✅ All platforms built successfully!"

.PHONY: build-linux
build-linux:
	@echo "📦 Building for Linux..."
	mkdir -p $(DIST_DIR)/linux
	$(WAILS) build -platform linux/amd64 -o $(DIST_DIR)/linux/$(APP_NAME)-linux-amd64 -ldflags "$(LDFLAGS)"
	@echo "✅ Linux build complete: $(DIST_DIR)/linux/"

.PHONY: build-linux-docker
build-linux-docker:
	@echo "🐳 Building for Linux using Docker..."
	chmod +x scripts/build-linux.sh
	./scripts/build-linux.sh

.PHONY: build-windows
build-windows:
	@echo "📦 Building for Windows..."
	mkdir -p $(DIST_DIR)/windows
	$(WAILS) build -platform windows/amd64 -o $(DIST_DIR)/windows/$(APP_NAME)-windows-amd64.exe -ldflags "$(LDFLAGS)"
	@echo "✅ Windows build complete: $(DIST_DIR)/windows/"

.PHONY: build-darwin
build-darwin:
	@echo "📦 Building for macOS..."
	mkdir -p $(DIST_DIR)/darwin
	$(WAILS) build -platform darwin/amd64 -o $(DIST_DIR)/darwin/$(APP_NAME)-darwin-amd64 -ldflags "$(LDFLAGS)"
	$(WAILS) build -platform darwin/arm64 -o $(DIST_DIR)/darwin/$(APP_NAME)-darwin-arm64 -ldflags "$(LDFLAGS)"
	@echo "✅ macOS build complete: $(DIST_DIR)/darwin/"

.PHONY: build-mac-app
build-mac-app:
	@echo "📦 Building macOS App Bundle (Universal)..."
	$(WAILS) build -platform darwin/universal -ldflags "$(LDFLAGS)"
	mkdir -p $(DIST_DIR)/macos
	cp -R $(BUILD_DIR)/$(APP_NAME).app $(DIST_DIR)/macos/
	@echo "✅ macOS App Bundle complete: $(DIST_DIR)/macos/$(APP_NAME).app"

# ============================================
# macOS DMG 打包
# ============================================

.PHONY: dmg
dmg: build-mac-app
	@echo "📦 Creating macOS DMG (Universal)..."
	rm -rf /tmp/$(APP_NAME)-dmg
	mkdir -p /tmp/$(APP_NAME)-dmg
	cp -R $(DIST_DIR)/macos/$(APP_NAME).app /tmp/$(APP_NAME)-dmg/
	ln -sf /Applications /tmp/$(APP_NAME)-dmg/Applications
	hdiutil create -volname "$(APP_DISPLAY_NAME)" \
		-srcfolder /tmp/$(APP_NAME)-dmg \
		-ov -format UDZO \
		$(DIST_DIR)/$(DMG_NAME)-universal.dmg
	rm -rf /tmp/$(APP_NAME)-dmg
	@echo "✅ DMG created: $(DIST_DIR)/$(DMG_NAME)-universal.dmg"

.PHONY: dmg-amd64
dmg-amd64:
	@echo "📦 Creating macOS DMG (AMD64)..."
	$(WAILS) build -platform darwin/amd64 -ldflags "$(LDFLAGS)"
	mkdir -p $(DIST_DIR)/macos
	cp -R $(BUILD_DIR)/$(APP_NAME).app $(DIST_DIR)/macos/
	rm -rf /tmp/$(APP_NAME)-dmg
	mkdir -p /tmp/$(APP_NAME)-dmg
	cp -R $(DIST_DIR)/macos/$(APP_NAME).app /tmp/$(APP_NAME)-dmg/
	ln -sf /Applications /tmp/$(APP_NAME)-dmg/Applications
	hdiutil create -volname "$(APP_DISPLAY_NAME)" \
		-srcfolder /tmp/$(APP_NAME)-dmg \
		-ov -format UDZO \
		$(DIST_DIR)/$(APP_NAME)-$(VERSION)-darwin-amd64.dmg
	rm -rf /tmp/$(APP_NAME)-dmg
	@echo "✅ DMG created: $(DIST_DIR)/$(APP_NAME)-$(VERSION)-darwin-amd64.dmg"

.PHONY: dmg-arm64
dmg-arm64:
	@echo "📦 Creating macOS DMG (ARM64)..."
	$(WAILS) build -platform darwin/arm64 -ldflags "$(LDFLAGS)"
	mkdir -p $(DIST_DIR)/macos
	cp -R $(BUILD_DIR)/$(APP_NAME).app $(DIST_DIR)/macos/
	rm -rf /tmp/$(APP_NAME)-dmg
	mkdir -p /tmp/$(APP_NAME)-dmg
	cp -R $(DIST_DIR)/macos/$(APP_NAME).app /tmp/$(APP_NAME)-dmg/
	ln -sf /Applications /tmp/$(APP_NAME)-dmg/Applications
	hdiutil create -volname "$(APP_DISPLAY_NAME)" \
		-srcfolder /tmp/$(APP_NAME)-dmg \
		-ov -format UDZO \
		$(DIST_DIR)/$(APP_NAME)-$(VERSION)-darwin-arm64.dmg
	rm -rf /tmp/$(APP_NAME)-dmg
	@echo "✅ DMG created: $(DIST_DIR)/$(APP_NAME)-$(VERSION)-darwin-arm64.dmg"

# ============================================
# 打包发布
# ============================================

.PHONY: package-all
package-all: package-linux package-windows package-darwin dmg
	@echo "✅ All packages created in $(DIST_DIR)/"

.PHONY: package-linux
package-linux: build-linux
	@echo "📦 Packaging Linux..."
	cd $(DIST_DIR)/linux && \
		tar -czvf $(APP_NAME)-$(VERSION)-linux-amd64.tar.gz $(APP_NAME)-linux-amd64
	@echo "✅ Linux packages created!"

.PHONY: package-windows
package-windows: build-windows
	@echo "📦 Packaging Windows..."
	cd $(DIST_DIR)/windows && \
		zip -r $(APP_NAME)-$(VERSION)-windows-amd64.zip $(APP_NAME)-windows-amd64.exe
	@echo "✅ Windows packages created!"

.PHONY: package-darwin
package-darwin: build-darwin
	@echo "📦 Packaging macOS..."
	cd $(DIST_DIR)/darwin && \
		tar -czvf $(APP_NAME)-$(VERSION)-darwin-amd64.tar.gz $(APP_NAME)-darwin-amd64 && \
		tar -czvf $(APP_NAME)-$(VERSION)-darwin-arm64.tar.gz $(APP_NAME)-darwin-arm64
	@echo "✅ macOS packages created!"

# ============================================
# 测试相关
# ============================================

.PHONY: test
test:
	$(GOCMD) test ./... -v

.PHONY: test-short
test-short:
	$(GOCMD) test ./... -short

.PHONY: test-coverage
test-coverage:
	$(GOCMD) test ./... -coverprofile=coverage.out
	$(GOCMD) tool cover -html=coverage.out -o coverage.html
	@echo "📊 Coverage report: coverage.html"

.PHONY: test-coverage-summary
test-coverage-summary:
	$(GOCMD) test ./... -cover

.PHONY: bench
bench:
	$(GOCMD) test ./... -bench=. -benchmem

# ============================================
# 代码检查
# ============================================

.PHONY: lint
lint:
	$(GOCMD) vet ./...
	cd frontend && npm run lint || true

.PHONY: fmt
fmt:
	$(GOCMD) fmt ./...

.PHONY: check
check: fmt lint test-short
	@echo "✅ All checks passed!"

# ============================================
# 清理
# ============================================

.PHONY: clean
clean:
	rm -rf $(BUILD_DIR)
	rm -rf $(DIST_DIR)
	rm -rf frontend/dist
	rm -f coverage.out coverage.html
	@echo "🧹 Clean complete!"

.PHONY: clean-deps
clean-deps:
	rm -rf frontend/node_modules
	rm -rf $(BUILD_DIR)
	@echo "🧹 Dependencies cleaned!"

# ============================================
# 安装依赖
# ============================================

.PHONY: install-deps
install-deps:
	cd frontend && npm install
	@echo "✅ Dependencies installed!"

.PHONY: install-wails
install-wails:
	$(GOCMD) install github.com/wailsapp/wails/v2/cmd/wails@latest
	@echo "✅ Wails installed!"

.PHONY: init
init: install-deps
	$(WAILS) init

# ============================================
# 发布
# ============================================

.PHONY: release
release: clean check build-release package-all
	@echo "✅ Release $(VERSION) complete!"

.PHONY: release-mac
release-mac: clean check dmg
	@echo "✅ macOS Release $(VERSION) complete!"

# ============================================
# 帮助
# ============================================

.PHONY: help
help:
	@echo "Crayon Terminal - Makefile Commands"
	@echo ""
	@echo "Development:"
	@echo "  make dev              - 启动开发服务器"
	@echo "  make dev-frontend     - 仅启动前端开发服务器"
	@echo "  make dev-backend      - 仅启动后端开发服务器"
	@echo ""
	@echo "Building:"
	@echo "  make build            - 构建当前平台"
	@echo "  make build-release    - 构建优化版本"
	@echo "  make build-all        - 构建所有平台"
	@echo "  make build-linux      - 构建 Linux (amd64)"
	@echo "  make build-windows    - 构建 Windows (amd64)"
	@echo "  make build-darwin     - 构建 macOS (amd64/arm64)"
	@echo "  make build-mac-app    - 构建 macOS App Bundle"
	@echo ""
	@echo "macOS DMG:"
	@echo "  make dmg              - 创建 Universal DMG"
	@echo "  make dmg-amd64        - 创建 Intel Mac DMG"
	@echo "  make dmg-arm64        - 创建 Apple Silicon DMG"
	@echo ""
	@echo "Packaging:"
	@echo "  make package-all      - 打包所有平台"
	@echo "  make package-linux    - 打包 Linux"
	@echo "  make package-windows  - 打包 Windows"
	@echo "  make package-darwin   - 打包 macOS tarball"
	@echo ""
	@echo "Testing:"
	@echo "  make test             - 运行所有测试"
	@echo "  make test-short       - 运行快速测试"
	@echo "  make test-coverage    - 生成测试覆盖率报告"
	@echo "  make bench            - 运行性能测试"
	@echo ""
	@echo "Code Quality:"
	@echo "  make lint             - 运行代码检查"
	@echo "  make fmt              - 格式化代码"
	@echo "  make check            - 运行所有检查"
	@echo ""
	@echo "Release:"
	@echo "  make release          - 完整发布流程"
	@echo "  make release-mac      - macOS 发布"
	@echo ""
	@echo "Utility:"
	@echo "  make clean            - 清理构建产物"
	@echo "  make clean-deps       - 清理依赖"
	@echo "  make install-deps     - 安装依赖"
	@echo "  make install-wails    - 安装 Wails CLI"
	@echo ""
	@echo "Version: $(VERSION)"