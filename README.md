# 🖍️ Crayon Terminal

![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-blue?style=flat-square)
![Tech Stack](https://img.shields.io/badge/Tech_Stack-Wails%20%7C%20Go%20%7C%20React-orange?style=flat-square)
![Version](https://img.shields.io/badge/Version-1.1.2-success?style=flat-square)

一个基于 Wails (Go + React) 构建的现代化多功能、跨平台终端管理工具。

## 🌟 核心亮点与功能

- 🔌 **全能枢纽连接**：全面兼容 SSH（密码 / 密钥 / Agent）、Telnet（智能协议协商加载）以及底层串行接口（Serial）。
- 🖥️ **现代化终端画布**：内嵌完整的 `xterm.js` 内核。支持垂直 / 水平的快捷分屏与标签视图管理，包含沉浸式的终端内内容搜索工具。
- ⚡ **自动化指令批量分发**：支持构建附带变量处理机制的常用命令库，并可实现一站式向当前所有的标签页“并行批量”下发指令操作。
- 📝 **自动监控与审计追溯**：自动拦截输入输出，提供会话记录系统并自动化按周归档至本地磁盘，且内置专属的日志索引检索。
- 🎨 **极客美学深度定制**：原生搭载 14 种专为工程师挑选的人体工学主题集。并能通过设置自定义带有模糊或全景沉浸特效的背景壁纸。
- 📤 **企业及团队灵活调度**：数据存储支持本地安全导出，导出的结构完美兼容密码敏感剔除，以及多规则冲突判定的可视化配置导入覆盖。

## 🖥️ 系统与构建依赖

- **运行需求**：macOS 10.15+ / Windows 10/11 / 现代 Linux
- **开发与构建**：Go 1.21+、Node.js 18+、Wails CLI v2

## 🚀 快速开始

```bash
# 1. 安装项目依赖
go mod download
cd frontend && npm install

# 2. 安装 Wails 开发环境 (若尚未安装)
go install github.com/wailsapp/wails/v2/cmd/wails@latest

# 3. 运行或构建应用
make dev       # 开发者模式 (等效于 wails dev)
make build     # 构建出当前平台的本地应用包
```

## 📂 用户数据与配置路径

应用的会话和运行时数据保存在用户的宿主目录：
- **macOS:** `~/.crayon/`
- **Windows:** `%APPDATA%/crayon/`
- **Linux:** `~/.config/crayon/`
