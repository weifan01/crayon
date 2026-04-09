package main

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/weifan01/crayon/internal/command"
	"github.com/weifan01/crayon/internal/connection"
	"github.com/weifan01/crayon/internal/logger"
	"github.com/weifan01/crayon/internal/session"
	"github.com/weifan01/crayon/internal/version"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App 应用结构
type App struct {
	ctx          context.Context
	connManager  *connection.Manager
	sessionStore *session.Store
	commandStore *command.Store
	logStore     *logger.Store
	configDir    string
	outputLoops  sync.Map // 记录哪些 tab 已经有输出循环在运行
}

// NewApp 创建应用
func NewApp() *App {
	return &App{
		connManager: connection.NewManager(),
	}
}

// startup 应用启动
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	// 获取配置目录
	homeDir, err := os.UserHomeDir()
	if err != nil {
		fmt.Println("Failed to get home directory:", err)
		return
	}

	a.configDir = filepath.Join(homeDir, ".crayon")
	if err := os.MkdirAll(a.configDir, 0755); err != nil {
		fmt.Println("Failed to create config directory:", err)
		return
	}

	// 初始化存储
	dbPath := filepath.Join(a.configDir, "crayon.db")
	a.sessionStore, err = session.NewStore(dbPath)
	if err != nil {
		fmt.Println("Failed to initialize session store:", err)
		return
	}

	a.commandStore, err = command.NewStore(dbPath)
	if err != nil {
		fmt.Println("Failed to initialize command store:", err)
		return
	}

	// 初始化日志存储
	logDir := filepath.Join(a.configDir, "logs")
	a.logStore = logger.NewStore(logDir)

	fmt.Println("Crayon started successfully")
}

// shutdown 应用关闭
func (a *App) shutdown(ctx context.Context) {
	// 断开所有连接
	a.connManager.DisconnectAll()

	// 关闭存储
	if a.sessionStore != nil {
		a.sessionStore.Close()
	}
	if a.commandStore != nil {
		a.commandStore.Close()
	}

	fmt.Println("Crayon shutdown successfully")
}

// beforeClose 关闭前检查是否有已连接的会话
func (a *App) beforeClose(ctx context.Context) bool {
	// 检查是否有已连接的会话
	connectedCount := a.connManager.CountByStatus(connection.StatusConnected)
	if connectedCount > 0 {
		// 显示确认对话框
		result, err := runtime.MessageDialog(a.ctx, runtime.MessageDialogOptions{
			Type:          runtime.QuestionDialog,
			Title:         "Close Confirmation",
			Message:       fmt.Sprintf("%d session(s) are connected. Are you sure you want to close the application?", connectedCount),
			Buttons:       []string{"Close", "Cancel"},
			DefaultButton: "Cancel",
			CancelButton:  "Cancel",
		})
		if err != nil {
			// 出错时允许关闭
			return false
		}
		// 返回 true 表示阻止关闭，false 表示允许关闭
		return result != "Close"
	}
	// 没有已连接的会话，允许关闭
	return false
}

// Window 窗口控制方法

// GetAppInfo 获取应用信息
func (a *App) GetAppInfo() version.AppInfo {
	return version.GetInfo()
}

// WindowMinimize 最小化窗口
func (a *App) WindowMinimize() {
	runtime.WindowMinimise(a.ctx)
}

// WindowMaximize 最大化/还原窗口
func (a *App) WindowMaximize() {
	runtime.WindowToggleMaximise(a.ctx)
}

// WindowClose 关闭窗口
func (a *App) WindowClose() {
	runtime.Quit(a.ctx)
}

// WindowIsMaximized 检查窗口是否最大化
func (a *App) WindowIsMaximized() bool {
	return runtime.WindowIsMaximised(a.ctx)
}

// WindowToggleFullscreen 切换全屏状态
func (a *App) WindowToggleFullscreen() {
	if runtime.WindowIsFullscreen(a.ctx) {
		runtime.WindowUnfullscreen(a.ctx)
	} else {
		runtime.WindowFullscreen(a.ctx)
	}
	// 发送事件通知前端窗口状态变化
	go func() {
		// 延迟发送，确保窗口已经完成切换
		time.Sleep(100 * time.Millisecond)
		runtime.EventsEmit(a.ctx, "window-fullscreen-changed")
	}()
}

// WindowIsFullscreen 检查窗口是否全屏
func (a *App) WindowIsFullscreen() bool {
	return runtime.WindowIsFullscreen(a.ctx)
}

// Clipboard 剪贴板方法

// ClipboardWrite 写入剪贴板
func (a *App) ClipboardWrite(text string) error {
	return runtime.ClipboardSetText(a.ctx, text)
}

// ClipboardRead 读取剪贴板
func (a *App) ClipboardRead() (string, error) {
	text, err := runtime.ClipboardGetText(a.ctx)
	return text, err
}

// File 文件操作方法

// SelectDirectory 打开目录选择对话框
func (a *App) SelectDirectory(title string, defaultPath string) (string, error) {
	return runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title:            title,
		DefaultDirectory: defaultPath,
	})
}

// SelectFile 打开文件选择对话框
func (a *App) SelectFile(title string, defaultPath string, filters string) (string, error) {
	var fileFilters []runtime.FileFilter
	if filters != "" {
		// 解析过滤器，格式: "描述:扩展名;描述:扩展名"
		for _, f := range splitFilters(filters) {
			fileFilters = append(fileFilters, f)
		}
	}
	return runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title:            title,
		DefaultDirectory: defaultPath,
		Filters:          fileFilters,
	})
}

// SelectFiles 打开多文件选择对话框
func (a *App) SelectFiles(title string, defaultPath string, filters string) ([]string, error) {
	var fileFilters []runtime.FileFilter
	if filters != "" {
		for _, f := range splitFilters(filters) {
			fileFilters = append(fileFilters, f)
		}
	}
	return runtime.OpenMultipleFilesDialog(a.ctx, runtime.OpenDialogOptions{
		Title:            title,
		DefaultDirectory: defaultPath,
		Filters:          fileFilters,
	})
}

// SaveFile 打开保存文件对话框
func (a *App) SaveFile(title string, defaultFilename string, defaultPath string) (string, error) {
	return runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:            title,
		DefaultFilename:  defaultFilename,
		DefaultDirectory: defaultPath,
	})
}

// ReadFile 读取文件内容
func (a *App) ReadFile(path string) ([]byte, error) {
	return os.ReadFile(path)
}

// ReadFileString 读取文件内容为字符串
func (a *App) ReadFileString(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

// ReadFileBase64 读取文件内容为 base64 编码字符串
func (a *App) ReadFileBase64(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(data), nil
}

// WriteFile 写入文件内容
func (a *App) WriteFile(path string, data []byte) error {
	return os.WriteFile(path, data, 0644)
}

// WriteFileString 写入字符串到文件
func (a *App) WriteFileString(path string, data string) error {
	return os.WriteFile(path, []byte(data), 0644)
}

// FileExists 检查文件是否存在
func (a *App) FileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

// MkdirAll 创建目录
func (a *App) MkdirAll(path string) error {
	return os.MkdirAll(path, 0755)
}

// GetHomeDir 获取用户主目录
func (a *App) GetHomeDir() (string, error) {
	return os.UserHomeDir()
}

// ListFiles 列出目录下的文件
func (a *App) ListFiles(dir string) ([]map[string]interface{}, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}

	var files []map[string]interface{}
	for _, entry := range entries {
		info, err := entry.Info()
		if err != nil {
			continue
		}
		files = append(files, map[string]interface{}{
			"name":     entry.Name(),
			"isDir":    entry.IsDir(),
			"size":     info.Size(),
			"modified": info.ModTime().Format("2006-01-02 15:04:05"),
		})
	}
	return files, nil
}

// splitFilters 解析过滤器字符串
// 格式: "描述:*.ext1;*.ext2;*.ext3" 或 "描述1:*.ext1;描述2:*.ext2"
func splitFilters(filters string) []runtime.FileFilter {
	var result []runtime.FileFilter

	// 找到第一个冒号的位置，用于分割描述和模式
	colonIdx := -1
	for i := 0; i < len(filters); i++ {
		if filters[i] == ':' {
			colonIdx = i
			break
		}
	}

	if colonIdx == -1 {
		// 没有冒号，直接作为 Pattern（无描述）
		if filters != "" {
			result = append(result, runtime.FileFilter{
				DisplayName: "Files",
				Pattern:     filters,
			})
		}
		return result
	}

	// 第一个冒号前是描述，后面是整个模式（可能包含分号分隔的多个扩展名）
	desc := filters[:colonIdx]
	patterns := filters[colonIdx+1:]

	if patterns != "" {
		result = append(result, runtime.FileFilter{
			DisplayName: desc,
			Pattern:     patterns,
		})
	}

	return result
}

func splitBySemicolon(s string) []string {
	var result []string
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] == ';' {
			result = append(result, s[start:i])
			start = i + 1
		}
	}
	if start < len(s) {
		result = append(result, s[start:])
	}
	return result
}

func splitByColon(s string) (string, string) {
	for i := 0; i < len(s); i++ {
		if s[i] == ':' {
			return s[:i], s[i+1:]
		}
	}
	return s, ""
}

// Session 相关方法

// ListSessions 列出所有会话
func (a *App) ListSessions() ([]*session.Session, error) {
	return a.sessionStore.ListSessions()
}

// GetSession 获取会话
func (a *App) GetSession(id string) (*session.Session, error) {
	return a.sessionStore.GetSession(id)
}

// CreateSession 创建会话
func (a *App) CreateSession(s *session.Session) error {
	return a.sessionStore.CreateSession(s)
}

// UpdateSession 更新会话
func (a *App) UpdateSession(s *session.Session) error {
	return a.sessionStore.UpdateSession(s)
}

// DeleteSession 删除会话
func (a *App) DeleteSession(id string) error {
	return a.sessionStore.DeleteSession(id)
}

// CloneSession 克隆会话
func (a *App) CloneSession(id string) (*session.Session, error) {
	return a.sessionStore.CloneSession(id)
}

// SearchSessions 搜索会话
func (a *App) SearchSessions(keyword string) ([]*session.Session, error) {
	return a.sessionStore.SearchSessions(keyword)
}

// Group 相关方法

// ListGroups 列出所有分组
func (a *App) ListGroups() ([]*session.Group, error) {
	return a.sessionStore.ListGroups()
}

// CreateGroup 创建分组
func (a *App) CreateGroup(name string, parentID string) (*session.Group, error) {
	// 输入验证
	if name == "" {
		return nil, fmt.Errorf("group name cannot be empty")
	}
	if len(name) > 50 {
		return nil, fmt.Errorf("group name cannot exceed 50 characters")
	}

	now := time.Now()
	group := &session.Group{
		ID:        generateID(),
		Name:      name,
		ParentID:  parentID,
		CreatedAt: session.FlexibleTime{Time: now},
		UpdatedAt: session.FlexibleTime{Time: now},
	}
	if err := a.sessionStore.CreateGroup(group); err != nil {
		return nil, err
	}
	return group, nil
}

// DeleteGroup 删除分组
func (a *App) DeleteGroup(id string) error {
	return a.sessionStore.DeleteGroup(id)
}

// UpdateGroup 更新分组（支持修改名称和父分组）
func (a *App) UpdateGroup(id string, name string, parentId string) (*session.Group, error) {
	// 先获取当前分组
	group, err := a.sessionStore.GetGroup(id)
	if err != nil {
		return nil, err
	}

	// 如果父分组变更，先移动
	if parentId != group.ParentID {
		if err := a.sessionStore.UpdateGroupParent(id, parentId); err != nil {
			return nil, err
		}
	}

	// 如果名称变更，更新名称
	if name != group.Name {
		return a.sessionStore.UpdateGroup(id, name)
	}

	// 没有变更，返回当前分组
	return a.sessionStore.GetGroup(id)
}

// MoveGroup 移动分组到新父级
func (a *App) MoveGroup(id string, newParentId string) error {
	return a.sessionStore.UpdateGroupParent(id, newParentId)
}

// ListGroupsTree 返回树形结构的分组列表
func (a *App) ListGroupsTree() ([]*session.GroupNode, error) {
	return a.sessionStore.ListGroupsTree()
}

// generateID 生成唯一ID
func generateID() string {
	// 使用加密安全的随机数生成 ID
	timestamp := time.Now().UnixNano()
	randomBytes := make([]byte, 4) // 8 hex 字符
	if _, err := rand.Read(randomBytes); err != nil {
		// 如果加密随机失败，使用时间戳作为后备
		return fmt.Sprintf("%d-%x", timestamp, timestamp&0xFFFFFFFF)
	}
	return fmt.Sprintf("%d-%s", timestamp, hex.EncodeToString(randomBytes))
}

// Tab 连接相关方法 - 每个标签页使用独立的连接

// ConnectTab 为标签页创建独立连接
func (a *App) ConnectTab(tabId string, sessionId string, cols, rows int) error {
	// 输入验证
	if tabId == "" {
		return fmt.Errorf("tabId cannot be empty")
	}
	if sessionId == "" {
		return fmt.Errorf("sessionId cannot be empty")
	}
	if cols <= 0 || cols > 1000 {
		cols = 80 // 使用默认值
	}
	if rows <= 0 || rows > 500 {
		rows = 24 // 使用默认值
	}

	// 检查该 tab 是否已有连接
	if conn, exists := a.connManager.Get(tabId); exists {
		if conn.Status() == connection.StatusConnected {
			// 已连接，同步终端大小并返回
			conn.Resize(cols, rows)
			// 只有在没有输出循环运行时才启动
			if _, running := a.outputLoops.Load(tabId); !running {
				a.outputLoops.Store(tabId, true)
				go a.readOutputLoop(tabId, conn)
			}
			return nil
		}
		// 状态不是已连接，移除旧连接
		a.connManager.Remove(tabId)
		a.outputLoops.Delete(tabId)
	}

	// 获取会话配置
	sess, err := a.sessionStore.GetSession(sessionId)
	if err != nil {
		return err
	}

	// 开始日志记录
	if a.logStore != nil {
		a.logStore.StartSession(tabId, sessionId, sess.Name, string(sess.Protocol), sess.Host)
	}

	// 根据协议创建连接（使用 tabId 作为连接ID）
	switch sess.Protocol {
	case session.ProtocolSSH:
		return a.connectSSH(tabId, sess, cols, rows)
	case session.ProtocolTelnet:
		return a.connectTelnet(tabId, sess, cols, rows)
	case session.ProtocolSerial:
		return a.connectSerial(tabId, sess, cols, rows)
	default:
		return fmt.Errorf("unsupported protocol: %s", sess.Protocol)
	}
}

// connectSSH 建立 SSH 连接
func (a *App) connectSSH(tabId string, sess *session.Session, cols, rows int) error {
	var auth connection.AuthMethod

	switch sess.AuthType {
	case session.AuthTypePassword:
		auth = &connection.PasswordAuth{Password: sess.Password}
	case session.AuthTypeKey:
		auth = &connection.KeyAuth{
			KeyPath:       sess.KeyPath,
			KeyPassphrase: sess.KeyPassphrase,
		}
	case session.AuthTypeAgent:
		auth = &connection.AgentAuth{}
	default:
		return fmt.Errorf("unsupported auth type: %s", sess.AuthType)
	}

	// 使用 tabId 作为连接ID
	conn := connection.NewSSHConnection(connection.SSHConfig{
		ID:        tabId,
		Host:      sess.Host,
		Port:      sess.Port,
		User:      sess.User,
		Auth:      auth,
		KeepAlive: time.Duration(sess.KeepAlive) * time.Second,
		Cols:      cols,
		Rows:      rows,
	})

	if err := conn.Connect(); err != nil {
		return err
	}

	// 添加到管理器
	if err := a.connManager.Add(conn); err != nil {
		conn.Disconnect()
		return err
	}

	// 更新最后使用时间
	a.sessionStore.UpdateLastUsed(sess.ID)

	// 执行登录脚本
	if len(sess.LoginScript) > 0 {
		for _, cmd := range sess.LoginScript {
			conn.Send([]byte(cmd + "\n"))
		}
	}

	// 启动输出读取循环
	a.outputLoops.Store(tabId, true)
	go a.readOutputLoop(tabId, conn)

	return nil
}

// connectTelnet 建立 Telnet 连接
func (a *App) connectTelnet(tabId string, sess *session.Session, cols, rows int) error {
	conn := connection.NewTelnetConnection(connection.TelnetConfig{
		ID:            tabId,
		Host:          sess.Host,
		Port:          sess.Port,
		Cols:          cols,
		Rows:          rows,
		Username:      sess.User,
		Password:      sess.Password,
		TerminalType:  sess.TerminalType,
		NoNegotiation: sess.NoNegotiation,
	})

	// 设置 ECHO 协商状态变化回调
	conn.SetOnEchoChange(func(needLocalEcho bool) {
		if a.ctx != nil {
			runtime.EventsEmit(a.ctx, "telnet-echo-change-"+tabId, needLocalEcho)
		}
	})

	if err := conn.Connect(); err != nil {
		return err
	}

	if err := a.connManager.Add(conn); err != nil {
		conn.Disconnect()
		return err
	}

	a.sessionStore.UpdateLastUsed(sess.ID)

	// 执行登录脚本
	if len(sess.LoginScript) > 0 {
		go func() {
			// 等待登录完成
			time.Sleep(2 * time.Second)
			for _, cmd := range sess.LoginScript {
				conn.Send([]byte(cmd + "\r\n"))
				time.Sleep(500 * time.Millisecond)
			}
		}()
	}

	a.outputLoops.Store(tabId, true)
	go a.readOutputLoop(tabId, conn)

	return nil
}

// connectSerial 建立 Serial 连接
func (a *App) connectSerial(tabId string, sess *session.Session, cols, rows int) error {
	conn := connection.NewSerialConnection(connection.SerialConfig{
		ID:       tabId,
		Port:     sess.Host,
		BaudRate: sess.Port,
		DataBits: sess.DataBits,
		StopBits: sess.StopBits,
		Parity:   sess.Parity,
		Cols:     cols,
		Rows:     rows,
	})

	if err := conn.Connect(); err != nil {
		return err
	}

	if err := a.connManager.Add(conn); err != nil {
		conn.Disconnect()
		return err
	}

	a.sessionStore.UpdateLastUsed(sess.ID)
	a.outputLoops.Store(tabId, true)
	go a.readOutputLoop(tabId, conn)

	return nil
}

// readOutputLoop 读取连接输出并推送到前端
func (a *App) readOutputLoop(tabId string, conn connection.Connection) {
	defer a.outputLoops.Delete(tabId)

	// 用于追踪结束原因
	endReason := "normal_close"

	defer func() {
		// 结束日志记录
		if a.logStore != nil {
			a.logStore.EndSession(tabId, endReason)
		}
	}()

	eventName := "terminal-data-" + tabId

	for {
		data, err := conn.Receive()
		if err != nil {
			if err.Error() != "EOF" && !containsEOF(err.Error()) {
				fmt.Printf("Tab %s error: %v\n", tabId, err)
				endReason = "network_error"
			}
			// 输出循环退出时，断开连接并更新状态
			a.connManager.Remove(tabId)
			runtime.EventsEmit(a.ctx, "terminal-disconnected-"+tabId)
			return
		}

		if len(data) > 0 {
			// 记录输出日志
			if a.logStore != nil {
				a.logStore.LogOutput(tabId, string(data))
			}
			runtime.EventsEmit(a.ctx, eventName, string(data))
		}
	}
}

// containsEOF 检查错误是否包含 EOF
func containsEOF(errStr string) bool {
	return len(errStr) >= 3 && (errStr == "EOF" || errStr[len(errStr)-4:] == ": EOF")
}

// DisconnectTab 断开标签页连接
func (a *App) DisconnectTab(tabId string) error {
	a.outputLoops.Delete(tabId)
	return a.connManager.Remove(tabId)
}

// GetTabStatus 获取标签页连接状态
func (a *App) GetTabStatus(tabId string) string {
	conn, exists := a.connManager.Get(tabId)
	if !exists {
		return "disconnected"
	}
	return string(conn.Status())
}

// SendToTab 向标签页发送数据
func (a *App) SendToTab(tabId string, data string) error {
	conn, exists := a.connManager.Get(tabId)
	if !exists {
		return fmt.Errorf("tab not connected")
	}

	// 记录输入日志
	if a.logStore != nil {
		a.logStore.LogInput(tabId, data)
	}

	return conn.Send([]byte(data))
}

// ResizeTab 调整标签页终端大小
func (a *App) ResizeTab(tabId string, cols, rows int) error {
	conn, exists := a.connManager.Get(tabId)
	if !exists {
		return fmt.Errorf("tab not connected")
	}
	return conn.Resize(cols, rows)
}

// 保留旧的 Session 连接方法以兼容

// ConnectSession 连接会话
func (a *App) ConnectSession(sessionID string) error {
	return a.ConnectSessionWithSize(sessionID, 80, 24)
}

// ConnectSessionWithSize 带终端大小连接会话
func (a *App) ConnectSessionWithSize(sessionID string, cols, rows int) error {
	return a.ConnectTab(sessionID, sessionID, cols, rows)
}

// DisconnectSession 断开会话
func (a *App) DisconnectSession(sessionID string) error {
	return a.DisconnectTab(sessionID)
}

// GetSessionStatus 获取会话状态
func (a *App) GetSessionStatus(sessionID string) string {
	return a.GetTabStatus(sessionID)
}

// SendToSession 向会话发送数据
func (a *App) SendToSession(sessionID string, data string) error {
	return a.SendToTab(sessionID, data)
}

// ResizeSession 调整会话终端大小
func (a *App) ResizeSession(sessionID string, cols, rows int) error {
	return a.ResizeTab(sessionID, cols, rows)
}

// NeedLocalEcho 查询会话是否需要本地回显
// Telnet 连接根据协商结果返回，SSH 返回 false，Serial 返回 true
func (a *App) NeedLocalEcho(tabId string) bool {
	if conn, exists := a.connManager.Get(tabId); exists {
		return conn.NeedLocalEcho()
	}
	// 默认返回 true（未连接时假设需要本地回显）
	return true
}

// Command 相关方法

// ListCommands 列出所有命令
func (a *App) ListCommands() ([]*command.Command, error) {
	return a.commandStore.ListCommands()
}

// GetCommand 获取命令
func (a *App) GetCommand(id string) (*command.Command, error) {
	return a.commandStore.GetCommand(id)
}

// CreateCommand 创建命令
func (a *App) CreateCommand(cmd *command.Command) error {
	return a.commandStore.CreateCommand(cmd)
}

// UpdateCommand 更新命令
func (a *App) UpdateCommand(cmd *command.Command) error {
	return a.commandStore.UpdateCommand(cmd)
}

// DeleteCommand 删除命令
func (a *App) DeleteCommand(id string) error {
	return a.commandStore.DeleteCommand(id)
}

// SearchCommands 搜索命令
func (a *App) SearchCommands(keyword string) ([]*command.Command, error) {
	return a.commandStore.SearchCommands(keyword)
}

// ExecuteBatch 批量执行命令
func (a *App) ExecuteBatch(req command.ExecutionRequest) ([]command.ExecutionResult, error) {
	executor := command.NewBatchExecutor(a.connManager)
	return executor.Execute(a.ctx, req)
}

// Import/Export 相关类型定义

// ExportConfig 导出配置结构
type ExportConfig struct {
	Version    string             `json:"version"`
	ExportTime string             `json:"exportTime"`
	AppName    string             `json:"appName"`
	Sessions   []ExportedSession  `json:"sessions"`
	Commands   []*command.Command `json:"commands"`
}

// ExportedSession 导出的会话数据
type ExportedSession struct {
	ID           string            `json:"id"`
	Name         string            `json:"name"`
	Group        string            `json:"group"`
	Description  string            `json:"description"`
	Protocol     string            `json:"protocol"`
	Host         string            `json:"host"`
	Port         int               `json:"port"`
	User         string            `json:"user"`
	AuthType     string            `json:"authType"`
	Password     *string           `json:"password,omitempty"`      // 可选，仅当 includeSensitive=true
	KeyPath      string            `json:"keyPath,omitempty"`
	KeyPassphrase *string          `json:"keyPassphrase,omitempty"` // 可选，仅当 includeSensitive=true
	KeepAlive    int               `json:"keepAlive"`
	ProxyJump    string            `json:"proxyJump"`
	ProxyCommand string            `json:"proxyCommand"`
	TerminalType string            `json:"terminalType"`
	FontSize     int               `json:"fontSize"`
	FontFamily   string            `json:"fontFamily"`
	ThemeID      string            `json:"themeId"`
	Encoding     string            `json:"encoding"`
	DataBits     int               `json:"dataBits"`
	StopBits     int               `json:"stopBits"`
	Parity       string            `json:"parity"`
	LoginScript  []string          `json:"loginScript"`
	Tags         []string          `json:"tags"`
	CreatedAt    string            `json:"createdAt"`
	UpdatedAt    string            `json:"updatedAt"`
}

// ImportPreview 导入预览结果
type ImportPreview struct {
	Sessions       []ImportSessionPreview `json:"sessions"`
	Commands       []ImportCommandPreview `json:"commands"`
	TotalSessions  int                    `json:"totalSessions"`
	TotalCommands  int                    `json:"totalCommands"`
	NewSessions    int                    `json:"newSessions"`
	DuplicateCount int                    `json:"duplicateCount"`
}

// ImportSessionPreview 导入会话预览
type ImportSessionPreview struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Host       string `json:"host"`
	Protocol   string `json:"protocol"`
	IsNew      bool   `json:"isNew"`      // 是否是新会话
	ExistsName string `json:"existsName"` // 如果已存在，显示现有名称
}

// ImportCommandPreview 导入命令预览
type ImportCommandPreview struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Content string `json:"content"`
	IsNew   bool   `json:"isNew"`
}

// ImportOptions 导入选项
type ImportOptions struct {
	SessionMode    string            `json:"sessionMode"`    // "skip", "overwrite", "rename"
	CommandMode    string            `json:"commandMode"`    // "skip", "overwrite", "rename"
	SelectedIDs    []string          `json:"selectedIds"`    // 选择性导入的 ID 列表，空表示全部
	SessionNewIDs  map[string]string `json:"sessionNewIds"`  // 会话重命名映射（原ID -> 新ID）
}

// ExportConfig 导出配置
func (a *App) ExportConfig() (string, error) {
	return a.ExportConfigWithOptions(false)
}

// ExportConfigWithOptions 导出配置（带选项）
func (a *App) ExportConfigWithOptions(includeSensitive bool) (string, error) {
	sessions, err := a.sessionStore.ListSessions()
	if err != nil {
		return "", err
	}

	commands, err := a.commandStore.ListCommands()
	if err != nil {
		return "", err
	}

	exportedSessions := make([]ExportedSession, 0, len(sessions))
	for _, s := range sessions {
		es := ExportedSession{
			ID:           s.ID,
			Name:         s.Name,
			Group:        s.Group,
			Description:  s.Description,
			Protocol:     string(s.Protocol),
			Host:         s.Host,
			Port:         s.Port,
			User:         s.User,
			AuthType:     string(s.AuthType),
			KeyPath:      s.KeyPath,
			KeepAlive:    s.KeepAlive,
			ProxyJump:    s.ProxyJump,
			ProxyCommand: s.ProxyCommand,
			TerminalType: s.TerminalType,
			FontSize:     s.FontSize,
			FontFamily:   s.FontFamily,
			ThemeID:      s.ThemeID,
			Encoding:     s.Encoding,
			DataBits:     s.DataBits,
			StopBits:     s.StopBits,
			Parity:       string(s.Parity),
			LoginScript:  s.LoginScript,
			Tags:         s.Tags,
		}

		if !s.CreatedAt.IsZero() {
			es.CreatedAt = s.CreatedAt.Format(time.RFC3339)
		}
		if !s.UpdatedAt.IsZero() {
			es.UpdatedAt = s.UpdatedAt.Format(time.RFC3339)
		}

		// 仅当用户选择包含敏感信息时才导出
		if includeSensitive {
			if s.Password != "" {
				es.Password = &s.Password
			}
			if s.KeyPassphrase != "" {
				es.KeyPassphrase = &s.KeyPassphrase
			}
		}

		exportedSessions = append(exportedSessions, es)
	}

	config := ExportConfig{
		Version:    "1.0",
		ExportTime: time.Now().Format(time.RFC3339),
		AppName:    "Crayon",
		Sessions:   exportedSessions,
		Commands:   commands,
	}

	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return "", err
	}

	return string(data), nil
}

// PreviewImport 预览导入内容
func (a *App) PreviewImport(jsonData string) (*ImportPreview, error) {
	var config ExportConfig
	if err := json.Unmarshal([]byte(jsonData), &config); err != nil {
		return nil, fmt.Errorf("invalid config format: %w", err)
	}

	// 验证版本
	if config.Version == "" {
		return nil, fmt.Errorf("missing version field")
	}

	preview := &ImportPreview{
		Sessions:      []ImportSessionPreview{},
		Commands:      []ImportCommandPreview{},
		TotalSessions: len(config.Sessions),
		TotalCommands: len(config.Commands),
	}

	// 检查会话冲突
	for _, s := range config.Sessions {
		sp := ImportSessionPreview{
			ID:       s.ID,
			Name:     s.Name,
			Host:     s.Host,
			Protocol: s.Protocol,
			IsNew:    true,
		}

		// 检查是否已存在相同 ID 的会话
		existing, err := a.sessionStore.GetSession(s.ID)
		if err == nil && existing != nil {
			sp.IsNew = false
			sp.ExistsName = existing.Name
			preview.DuplicateCount++
		}

		if sp.IsNew {
			preview.NewSessions++
		}

		preview.Sessions = append(preview.Sessions, sp)
	}

	// 检查命令冲突
	for _, c := range config.Commands {
		cp := ImportCommandPreview{
			ID:      c.ID,
			Name:    c.Name,
			Content: c.Content,
			IsNew:   true,
		}

		existing, err := a.commandStore.GetCommand(c.ID)
		if err == nil && existing != nil {
			cp.IsNew = false
		}

		preview.Commands = append(preview.Commands, cp)
	}

	return preview, nil
}

// ImportConfig 导入配置（简单模式，跳过重复）
func (a *App) ImportConfig(jsonData string) error {
	return a.ImportConfigWithOptions(jsonData, ImportOptions{
		SessionMode: "skip",
		CommandMode: "skip",
	})
}

// ImportConfigWithOptions 导入配置（带选项）
func (a *App) ImportConfigWithOptions(jsonData string, options ImportOptions) error {
	var config ExportConfig
	if err := json.Unmarshal([]byte(jsonData), &config); err != nil {
		return fmt.Errorf("invalid config format: %w", err)
	}

	// 创建选择集合
	selectedSet := make(map[string]bool)
	for _, id := range options.SelectedIDs {
		selectedSet[id] = true
	}
	selectAll := len(options.SelectedIDs) == 0

	// 导入会话
	for _, s := range config.Sessions {
		// 检查是否在选中列表中
		if !selectAll && !selectedSet[s.ID] {
			continue
		}

		// 检查是否已存在
		existing, _ := a.sessionStore.GetSession(s.ID)
		if existing != nil {
			switch options.SessionMode {
			case "skip":
				continue
			case "overwrite":
				// 更新现有会话
				sess := a.exportedToSession(s)
				if err := a.sessionStore.UpdateSession(sess); err != nil {
					fmt.Printf("Failed to update session %s: %v\n", s.ID, err)
				}
			case "rename":
				// 使用新 ID 创建
				sess := a.exportedToSession(s)
				if newID, ok := options.SessionNewIDs[s.ID]; ok {
					sess.ID = newID
				} else {
					sess.ID = "" // 生成新 ID
				}
				if err := a.sessionStore.CreateSession(sess); err != nil {
					fmt.Printf("Failed to create session: %v\n", err)
				}
			}
		} else {
			// 新会话，直接创建
			sess := a.exportedToSession(s)
			if err := a.sessionStore.CreateSession(sess); err != nil {
				fmt.Printf("Failed to create session %s: %v\n", s.ID, err)
			}
		}
	}

	// 导入命令
	for _, c := range config.Commands {
		if !selectAll && !selectedSet[c.ID] {
			continue
		}

		existing, _ := a.commandStore.GetCommand(c.ID)
		if existing != nil {
			switch options.CommandMode {
			case "skip":
				continue
			case "overwrite":
				if err := a.commandStore.UpdateCommand(c); err != nil {
					fmt.Printf("Failed to update command %s: %v\n", c.ID, err)
				}
			case "rename":
				c.ID = "" // 生成新 ID
				if err := a.commandStore.CreateCommand(c); err != nil {
					fmt.Printf("Failed to create command: %v\n", err)
				}
			}
		} else {
			if err := a.commandStore.CreateCommand(c); err != nil {
				fmt.Printf("Failed to create command %s: %v\n", c.ID, err)
			}
		}
	}

	return nil
}

// exportedToSession 将导出的会话转换为 Session 对象
func (a *App) exportedToSession(es ExportedSession) *session.Session {
	sess := &session.Session{
		ID:           es.ID,
		Name:         es.Name,
		Group:        es.Group,
		Description:  es.Description,
		Protocol:     session.Protocol(es.Protocol),
		Host:         es.Host,
		Port:         es.Port,
		User:         es.User,
		AuthType:     session.AuthType(es.AuthType),
		KeyPath:      es.KeyPath,
		KeepAlive:    es.KeepAlive,
		ProxyJump:    es.ProxyJump,
		ProxyCommand: es.ProxyCommand,
		TerminalType: es.TerminalType,
		FontSize:     es.FontSize,
		FontFamily:   es.FontFamily,
		ThemeID:      es.ThemeID,
		Encoding:     es.Encoding,
		DataBits:     es.DataBits,
		StopBits:     es.StopBits,
		Parity:       es.Parity,
		LoginScript:  es.LoginScript,
		Tags:         es.Tags,
	}

	// 处理敏感字段
	if es.Password != nil {
		sess.Password = *es.Password
	}
	if es.KeyPassphrase != nil {
		sess.KeyPassphrase = *es.KeyPassphrase
	}

	// 解析时间
	if es.CreatedAt != "" {
		sess.CreatedAt = parseTime(es.CreatedAt)
	}
	if es.UpdatedAt != "" {
		sess.UpdatedAt = parseTime(es.UpdatedAt)
	}

	return sess
}

// parseTime 解析时间字符串
func parseTime(s string) session.FlexibleTime {
	var ft session.FlexibleTime
	t, err := time.Parse(time.RFC3339, s)
	if err == nil {
		ft.Time = t
	}
	return ft
}

// ConfirmDialog 确认对话框
func (a *App) ConfirmDialog(title, message string) bool {
	result, err := runtime.MessageDialog(a.ctx, runtime.MessageDialogOptions{
		Type:          runtime.QuestionDialog,
		Title:         title,
		Message:       message,
		Buttons:       []string{"确定", "取消"},
		DefaultButton: "确定",
		CancelButton:  "取消",
	})
	if err != nil {
		return false
	}
	return result == "确定"
}

// Logger 相关方法

// GetLogList 获取日志文件列表
func (a *App) GetLogList() ([]logger.LogFileInfo, error) {
	if a.logStore == nil {
		return nil, fmt.Errorf("log store not initialized")
	}
	return a.logStore.GetLogList()
}

// ReadLogFile 读取日志文件内容
func (a *App) ReadLogFile(fullPath string) (string, error) {
	if a.logStore == nil {
		return "", fmt.Errorf("log store not initialized")
	}
	return a.logStore.ReadLogFile(fullPath)
}

// GetLogDir 获取日志目录路径
func (a *App) GetLogDir() string {
	if a.logStore == nil {
		return ""
	}
	return a.logStore.GetLogDir()
}

// SetLoggingEnabled 设置是否启用日志
func (a *App) SetLoggingEnabled(enabled bool) {
	if a.logStore != nil {
		a.logStore.SetEnabled(enabled)
	}
}

// ============ 背景图片相关方法 ============

// SaveBackgroundImage 保存背景图片 (接收 base64 编码的字符串)
func (a *App) SaveBackgroundImage(base64Data string, filename string) (string, error) {
	bgDir := filepath.Join(a.configDir, "backgrounds")
	if err := os.MkdirAll(bgDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create backgrounds directory: %w", err)
	}

	// 解码 base64
	imageData, err := base64.StdEncoding.DecodeString(base64Data)
	if err != nil {
		return "", fmt.Errorf("failed to decode base64: %w", err)
	}

	// 生成唯一文件名
	ext := filepath.Ext(filename)
	uniqueName := fmt.Sprintf("%d%s", time.Now().UnixNano(), ext)
	fullPath := filepath.Join(bgDir, uniqueName)

	if err := os.WriteFile(fullPath, imageData, 0644); err != nil {
		return "", fmt.Errorf("failed to save image: %w", err)
	}

	return uniqueName, nil
}

// LoadBackgroundImage 加载背景图片 (返回 base64 编码的字符串)
func (a *App) LoadBackgroundImage(filename string) (string, error) {
	fullPath := filepath.Join(a.configDir, "backgrounds", filename)
	data, err := os.ReadFile(fullPath)
	if err != nil {
		return "", fmt.Errorf("failed to load image: %w", err)
	}
	return base64.StdEncoding.EncodeToString(data), nil
}

// DeleteBackgroundImage 删除背景图片
func (a *App) DeleteBackgroundImage(filename string) error {
	fullPath := filepath.Join(a.configDir, "backgrounds", filename)
	if err := os.Remove(fullPath); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("failed to delete image: %w", err)
	}
	return nil
}

// GetBackgroundDir 获取背景图片目录
func (a *App) GetBackgroundDir() string {
	return filepath.Join(a.configDir, "backgrounds")
}

// BackgroundFileInfo 背景图片信息
type BackgroundFileInfo struct {
	Name         string `json:"name"`
	Size         int64  `json:"size"`
	ModifiedTime string `json:"modifiedTime"`
}

// ListBackgroundImages 列出已保存的背景图片
func (a *App) ListBackgroundImages() ([]BackgroundFileInfo, error) {
	bgDir := filepath.Join(a.configDir, "backgrounds")
	entries, err := os.ReadDir(bgDir)
	if err != nil {
		if os.IsNotExist(err) {
			return []BackgroundFileInfo{}, nil
		}
		return nil, err
	}

	var files []BackgroundFileInfo
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		files = append(files, BackgroundFileInfo{
			Name:         entry.Name(),
			Size:         info.Size(),
			ModifiedTime: info.ModTime().Format(time.RFC3339),
		})
	}

	return files, nil
}
