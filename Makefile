# Crayon Terminal - Makefile

VERSION   ?= v1.1.0
BUILD_TIME := $(shell date +%Y-%m-%d)
GIT_COMMIT := $(shell git rev-parse --short HEAD 2>/dev/null || echo "unknown")

LDFLAGS := -s -w \
	-X "github.com/weifan01/crayon/internal/version.Version=$(VERSION)" \
	-X "github.com/weifan01/crayon/internal/version.BuildTime=$(BUILD_TIME)" \
	-X "github.com/weifan01/crayon/internal/version.GitCommit=$(GIT_COMMIT)"

DIST_DIR     := dist
RESOURCES_DIR := resources
BUILD_DIR    := build
APP_NAME     := crayon
APP_DISPLAY_NAME := Crayon

# ============================================
# 资源准备
# ============================================

# 检测 sed 实现类型（GNU sed vs BSD sed）
GNU_SED_CHECK := $(shell sed --version 2>/dev/null | grep -q GNU && echo 0 || echo 1)
ifeq ($(GNU_SED_CHECK),0)
	SED_INPLACE = sed -i
else
	SED_INPLACE = sed -i ''
endif

.PHONY: update-version
update-version:
	@$(SED_INPLACE) 's/"productVersion": "v[0-9.]*"/"productVersion": "$(VERSION)"/' wails.json
	@echo "Updated version to $(VERSION)"

.PHONY: prepare-resources
prepare-resources: update-version
	@mkdir -p $(BUILD_DIR)/windows
	@cp $(RESOURCES_DIR)/icons/appicon.png $(BUILD_DIR)/
	@cp $(RESOURCES_DIR)/icons/icon.ico $(BUILD_DIR)/windows/
	@cp $(RESOURCES_DIR)/info.json $(BUILD_DIR)/windows/
	@cp $(RESOURCES_DIR)/wails.exe.manifest $(BUILD_DIR)/windows/

# ============================================
# 开发与构建
# ============================================

.PHONY: dev
dev: prepare-resources
	wails dev

.PHONY: build
build: prepare-resources
	@mkdir -p $(DIST_DIR)
	wails build -o $(APP_NAME) -ldflags "$(LDFLAGS)"

# ============================================
# 跨平台构建
# ============================================

.PHONY: build-all
build-all: build-windows build-macos

build-linux: prepare-resources
	@mkdir -p $(DIST_DIR)/linux
	wails build -platform linux/amd64 -o $(APP_NAME)-$(VERSION)-linux-amd64 -ldflags "$(LDFLAGS)"
	@mv build/bin/$(APP_NAME)-$(VERSION)-linux-amd64 $(DIST_DIR)/linux/

build-linux-docker:
	chmod +x scripts/build-linux.sh
	VERSION=$(VERSION) LDFLAGS="$(LDFLAGS)" ./scripts/build-linux.sh

build-windows: prepare-resources
	@mkdir -p $(DIST_DIR)/windows
	wails build -platform windows/amd64 -o $(APP_NAME)-$(VERSION)-windows-amd64.exe -ldflags "$(LDFLAGS)"
	@mv build/bin/$(APP_NAME)-$(VERSION)-windows-amd64.exe $(DIST_DIR)/windows/

build-macos: build-macos-amd64 build-macos-arm64

build-macos-amd64: prepare-resources
	@mkdir -p $(DIST_DIR)/macos
	wails build -platform darwin/amd64 -o $(APP_NAME)-$(VERSION)-macos-amd64.app -ldflags "$(LDFLAGS)"
	@rm -rf $(DIST_DIR)/macos/$(APP_NAME)-$(VERSION)-macos-amd64.app
	@mv build/bin/$(APP_NAME).app $(DIST_DIR)/macos/$(APP_NAME)-$(VERSION)-macos-amd64.app

build-macos-arm64: prepare-resources
	@mkdir -p $(DIST_DIR)/macos
	wails build -platform darwin/arm64 -o $(APP_NAME)-$(VERSION)-macos-arm64.app -ldflags "$(LDFLAGS)"
	@rm -rf $(DIST_DIR)/macos/$(APP_NAME)-$(VERSION)-macos-arm64.app
	@mv build/bin/$(APP_NAME).app $(DIST_DIR)/macos/$(APP_NAME)-$(VERSION)-macos-arm64.app

build-macos-universal: prepare-resources
	@mkdir -p $(DIST_DIR)/macos
	wails build -platform darwin/universal -o $(APP_NAME).app -ldflags "$(LDFLAGS)"
	@rm -rf $(DIST_DIR)/macos/$(APP_NAME)-$(VERSION)-macos-universal.app
	@mv build/bin/$(APP_NAME).app $(DIST_DIR)/macos/$(APP_NAME)-$(VERSION)-macos-universal.app

# ============================================
# DMG 打包 (macOS)
# ============================================

define create-dmg
	@rm -rf /tmp/$(APP_NAME)-dmg && mkdir -p /tmp/$(APP_NAME)-dmg
	cp -R $(2) /tmp/$(APP_NAME)-dmg/$(APP_NAME).app
	ln -sf /Applications /tmp/$(APP_NAME)-dmg/Applications
	hdiutil create -volname "$(APP_DISPLAY_NAME)" -srcfolder /tmp/$(APP_NAME)-dmg -ov -format UDZO $(DIST_DIR)/macos/$(APP_NAME)-$(VERSION)-macos-$(1).dmg
	@rm -rf /tmp/$(APP_NAME)-dmg
endef

.PHONY: dmg-amd64 dmg-arm64 dmg dmg-all
dmg-all: dmg-amd64 dmg-arm64

dmg: build-macos-universal
	$(call create-dmg,universal,$(DIST_DIR)/macos/$(APP_NAME)-$(VERSION)-macos-universal.app)

dmg-amd64: build-macos-amd64
	$(call create-dmg,amd64,$(DIST_DIR)/macos/$(APP_NAME)-$(VERSION)-macos-amd64.app)

dmg-arm64: build-macos-arm64
	$(call create-dmg,arm64,$(DIST_DIR)/macos/$(APP_NAME)-$(VERSION)-macos-arm64.app)

# ============================================
# 测试与检查
# ============================================

.PHONY: test test-short lint fmt check
test:
	go test ./... -v

test-short:
	go test ./... -short

lint:
	go vet ./...

fmt:
	go fmt ./...

check: fmt lint test-short

# ============================================
# 清理与安装
# ============================================

.PHONY: clean install-deps install-wails
clean:
	rm -rf $(DIST_DIR) $(BUILD_DIR)/bin
	rm -f coverage.out coverage.html
	@mkdir -p frontend/dist && touch frontend/dist/.gitkeep

install-deps:
	cd frontend && npm install

install-wails:
	go install github.com/wailsapp/wails/v2/cmd/wails@latest

# ============================================
# 帮助
# ============================================

.PHONY: help
help:
	@echo "Crayon Terminal $(VERSION)"
	@echo ""
	@echo "开发:    dev"
	@echo "构建:    build, build-all, build-linux, build-windows, build-macos"
	@echo "DMG:     dmg, dmg-all, dmg-amd64, dmg-arm64"
	@echo "测试:    test, test-short, check"
	@echo "清理:    clean"
	@echo "安装:    install-deps, install-wails"
	@echo "版本:    update-version (同步 wails.json)"