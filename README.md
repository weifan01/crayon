# Crayon Terminal

一个现代化的跨平台终端管理工具，基于 Wails (Go + React) 构建，支持 SSH、Telnet 和串口连接。

## 功能特性

### 连接管理

| 功能 | 描述 |
|------|------|
| **SSH 连接** | 支持密码认证、公钥认证、SSH Agent 认证 |
| **Telnet 连接** | 支持自动登录、协议协商、本地/远程回显自动检测 |
| **串口连接** | 支持波特率、数据位、停止位、校验位配置 |
| **多标签页** | 同时管理多个连接，每个标签页独立运行 |
| **分屏显示** | 支持垂直分屏（左右）、水平分屏（上下） |
| **连接状态** | 实时显示连接中/已连接/断开/错误状态 |
| **会话时长** | 实时显示已连接会话的持续时间 |
| **自动聚焦** | 切换标签页时自动聚焦终端 |

### 会话管理

| 功能 | 描述 |
|------|------|
| **会话 CRUD** | 创建、查看、编辑、删除会话 |
| **会话克隆** | 快速复制会话配置 |
| **会话搜索** | 按关键字搜索会话 |
| **分组管理** | 树形分组结构，支持无限嵌套 |
| **分组折叠** | 全部展开/折叠分组 |
| **批量操作** | 批量移动分组、批量删除会话 |
| **登录脚本** | 配置自动登录命令序列 |

### 命令库

| 功能 | 描述 |
|------|------|
| **命令 CRUD** | 创建、查看、编辑、删除命令 |
| **命令分组** | 按分组组织命令 |
| **命令搜索** | 按关键字搜索命令 |
| **批量发送** | 向多个标签页批量发送命令 |
| **变量支持** | 命令中支持变量定义和默认值 |

### 终端功能

| 功能 | 描述 |
|------|------|
| **xterm.js 终端** | 完整的终端仿真，支持 256 色 |
| **主题支持** | 14 种预设主题（蜡笔风格） |
| **字体设置** | 自定义终端字体和大小 |
| **选中即复制** | 选中文本自动复制到剪贴板 |
| **右键粘贴** | 右键点击粘贴剪贴板内容 |
| **终端搜索** | 支持区分大小写、全词匹配、正则表达式 |
| **搜索框位置** | 可配置搜索框在顶部或底部 |
| **本地回显** | 根据连接类型自动判断是否需要本地回显 |

### 日志记录

| 功能 | 描述 |
|------|------|
| **会话日志** | 自动记录会话输入输出 |
| **按周归档** | 日志按周存储，便于管理 |
| **日志查看** | 内置日志查看器 |
| **日志搜索** | 搜索历史日志内容 |

### 配置管理

| 功能 | 描述 |
|------|------|
| **配置导出** | 导出会话、分组、命令为 JSON |
| **安全导出** | 可选择不包含密码等敏感信息 |
| **配置导入** | 从 JSON 文件导入配置 |
| **冲突处理** | 导入时支持跳过/覆盖/重命名 |
| **导入预览** | 导入前预览重复项 |

### 界面功能

| 功能 | 描述 |
|------|------|
| **侧边栏** | 会话列表、分组树、快速操作按钮 |
| **侧边栏模式** | 常驻显示、自动隐藏（鼠标悬停显示） |
| **侧边栏宽度** | 可拖拽调整宽度（180-400px） |
| **快速连接** | 快速建立 SSH/Telnet 连接（无需保存会话） |
| **右键菜单** | 会话右键操作（编辑、克隆、移动、删除） |
| **多选操作** | Ctrl/Cmd+点击多选，Shift+点击范围选择 |
| **协议徽章** | 不同协议显示不同颜色徽章 |
| **启动动画** | 启动时的欢迎界面 |

### 设置选项

| 功能 | 描述 |
|------|------|
| **语言切换** | 中文/英文界面 |
| **主题切换** | 14 种预设主题 |
| **终端设置** | 字体、大小、复制/粘贴行为 |
| **快捷键配置** | 自定义所有快捷键 |
| **背景图片** | 自定义背景图片（透明度、模糊、填充方式） |
| **关于页面** | 版本信息、构建信息 |

## 系统要求

- macOS 10.15+ (Catalina or later)
- Windows 10/11
- Linux (modern distributions)

## 构建要求

- Go 1.21+
- Node.js 18+
- Wails CLI v2

## 快速开始

### 安装依赖

```bash
# 安装 Go 依赖
go mod download

# 安装前端依赖
cd frontend && npm install
```

### 安装 Wails

```bash
go install github.com/wailsapp/wails/v2/cmd/wails@latest
```

### 开发模式

```bash
make dev
# 或者
wails dev
```

### 构建

```bash
# 构建当前平台
make build

# 构建所有平台
make build-all

# macOS DMG 打包
make dmg
```

## 项目结构

```
crayon/
├── app.go              # 主应用逻辑
├── main.go             # 入口点
├── go.mod              # Go 依赖
├── Makefile            # 构建脚本
├── wails.json          # Wails 配置
├── internal/           # 内部模块
│   ├── command/        # 命令管理
│   │   ├── model.go    # 数据模型
│   │   ├── store.go    # 数据存储
│   │   └── executor.go # 命令执行
│   ├── connection/     # 连接管理
│   │   ├── manager.go  # 连接管理器
│   │   ├── ssh.go      # SSH 实现
│   │   ├── telnet.go   # Telnet 实现
│   │   └── serial.go   # 串口实现
│   ├── logger/         # 日志记录
│   │   ├── model.go    # 日志模型
│   │   └── store.go    # 日志存储
│   ├── session/        # 会话管理
│   │   ├── model.go    # 会话模型
│   │   └── store.go    # 会话存储
│   └── version/        # 版本信息
├── frontend/           # 前端代码
│   ├── src/
│   │   ├── api/        # API 封装
│   │   ├── components/ # React 组件
│   │   ├── stores/     # Zustand 状态
│   │   └── App.tsx     # 主应用
│   ├── package.json
│   └── vite.config.ts
└── build/              # 构建资源
    ├── appicon.png
    └── darwin/
```

## 开发指南

### 运行测试

```bash
# 运行所有测试
make test

# 测试覆盖率报告
make test-coverage

# 快速测试（跳过慢速测试）
make test-short
```

### 代码检查

```bash
# 格式化代码
make fmt

# 运行检查
make lint

# 完整检查
make check
```

## 配置

应用配置存储在用户目录:
- macOS: `~/.crayon/`
- Windows: `%APPDATA%/crayon/`
- Linux: `~/.config/crayon/`

配置文件:
- `sessions.db` - SQLite 数据库，存储会话和命令配置
- `logs/` - 会话日志目录，按周归档
- `backgrounds/` - 背景图片目录

## 快捷键

| 功能 | macOS | Windows/Linux |
|------|-------|---------------|
| 打开设置 | Cmd+, | Ctrl+, |
| 切换标签页 | Ctrl+Tab | Ctrl+Tab |
| 垂直分屏 | Cmd+D | Ctrl+D |
| 水平分屏 | Cmd+Shift+D | Ctrl+Shift+D |
| 关闭分屏 | Cmd+Shift+W | Ctrl+Shift+W |
| 全屏 | Cmd+Enter | Ctrl+Enter |
| 搜索 | Cmd+F | Ctrl+F |
| 全选 | Ctrl+A | Ctrl+A |
| 取消选择 | Escape | Escape |

## 主题列表

| 主题名称 | 特点 |
|----------|------|
| crayon | 默认主题，蜡笔风格 |
| dark | 深色主题 |
| light | 浅色主题 |
| monokai | Monokai 配色 |
| dracula | Dracula 配色 |
| one-dark | One Dark 配色 |
| solarized-dark | Solarized 深色 |
| solarized-light | Solarized 浅色 |
| nord | Nord 配色 |
| gruvbox | Gruvbox 配色 |
| tokyo-night | Tokyo Night 配色 |
| catppuccin | Catppuccin 配色 |
| github-dark | GitHub 深色 |
| starry-night | 星夜主题 |

## 许可证

私有软件，保留所有权利。

## 版本

当前版本: 1.0.2