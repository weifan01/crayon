package session

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"time"
)

// Protocol 协议类型
type Protocol string

const (
	ProtocolSSH    Protocol = "ssh"
	ProtocolTelnet Protocol = "telnet"
	ProtocolSerial Protocol = "serial"
	ProtocolLocal  Protocol = "local"
)

// AuthType 认证类型
type AuthType string

const (
	AuthTypePassword AuthType = "password"
	AuthTypeKey      AuthType = "key"
	AuthTypeAgent    AuthType = "agent"
)

// FlexibleTime 可接受空字符串的时间类型
type FlexibleTime struct {
	time.Time
}

// UnmarshalJSON 自定义 JSON 解析
func (ft *FlexibleTime) UnmarshalJSON(data []byte) error {
	// 处理空字符串或 null
	var s string
	if err := json.Unmarshal(data, &s); err == nil {
		if s == "" {
			ft.Time = time.Time{}
			return nil
		}
		return ft.Time.UnmarshalJSON(data)
	}
	// 尝试直接解析为时间
	var t time.Time
	if err := json.Unmarshal(data, &t); err == nil {
		ft.Time = t
		return nil
	}
	// 设置为零值
	ft.Time = time.Time{}
	return nil
}

// MarshalJSON 自定义 JSON 序列化
func (ft FlexibleTime) MarshalJSON() ([]byte, error) {
	if ft.Time.IsZero() {
		return json.Marshal("")
	}
	return ft.Time.MarshalJSON()
}

// IsZero 检查是否为零值
func (ft FlexibleTime) IsZero() bool {
	return ft.Time.IsZero()
}

// Session 会话配置
type Session struct {
	ID            string   `json:"id"`
	Name          string   `json:"name"`
	Group         string   `json:"group"`
	Description   string   `json:"description"`
	Protocol      Protocol `json:"protocol"`
	Host          string   `json:"host"`
	Port          int      `json:"port"`
	User          string   `json:"user"`
	AuthType      AuthType `json:"authType"`
	Password      string   `json:"password"`
	KeyPath       string   `json:"keyPath"`
	KeyPassphrase string   `json:"keyPassphrase"`
	KeepAlive     int      `json:"keepAlive"`
	ProxyJump     string   `json:"proxyJump"`
	ProxyCommand  string   `json:"proxyCommand"`
	TerminalType  string   `json:"terminalType"`
	FontSize      int      `json:"fontSize"`
	FontFamily    string   `json:"fontFamily"`
	ThemeID       string   `json:"themeId"`
	Encoding      string   `json:"encoding"`
	// Serial 协议专用字段
	DataBits int    `json:"dataBits"`
	StopBits int    `json:"stopBits"`
	Parity   string `json:"parity"`
	// Telnet 协议专用字段
	NoNegotiation bool `json:"noNegotiation"` // 禁用 Telnet 协商（用于连接非 Telnet 服务器）
	// Local 协议专用字段
	LocalEnv    []string     `json:"localEnv"` // 本地 Shell 的环境变量
	LoginScript []string     `json:"loginScript"`
	CreatedAt   FlexibleTime `json:"createdAt"`
	UpdatedAt   FlexibleTime `json:"updatedAt"`
	LastUsedAt  FlexibleTime `json:"lastUsedAt"`
	Tags        []string     `json:"tags"`
	// 个性化设置
	UseCustomSettings bool    `json:"useCustomSettings"` // 启用个性化设置
	TemplateID        string  `json:"templateId"`        // 关联的模板 ID
	Scrollback        int     `json:"scrollback"`        // 滚动缓冲区行数
	// 背景设置
	BackgroundImage   string `json:"backgroundImage"`   // 背景图片路径
	BackgroundOpacity int    `json:"backgroundOpacity"` // 背景透明度 (0-100)
	BackgroundBlur    int    `json:"backgroundBlur"`    // 背景模糊度 (0-20)
	// 光标设置
	CursorStyle string `json:"cursorStyle"` // 光标样式: block | underline | bar
	CursorBlink bool   `json:"cursorBlink"` // 光标是否闪烁
	// 样式设置
	LineHeight        float64 `json:"lineHeight"`        // 行高倍数 (1.0-2.0)
	LetterSpacing     float64 `json:"letterSpacing"`     // 字间距 (0-10)
}

// Group 会话分组
type Group struct {
	ID        string       `json:"id"`
	Name      string       `json:"name"`
	ParentID  string       `json:"parentId"`
	Path      string       `json:"path"`
	SortOrder int          `json:"sortOrder"`
	CreatedAt FlexibleTime `json:"createdAt"`
	UpdatedAt FlexibleTime `json:"updatedAt"`
}

// GroupNode 树形分组节点
type GroupNode struct {
	Group    *Group       `json:"group"`
	Children []*GroupNode `json:"children"`
}

// NewSession 创建新会话
func NewSession(name string, protocol Protocol) *Session {
	now := FlexibleTime{Time: time.Now()}
	return &Session{
		ID:                generateSessionID(),
		Name:              name,
		Protocol:          protocol,
		Port:              defaultPort(protocol),
		TerminalType:      "xterm-256color",
		FontSize:          14,
		FontFamily:        "Monaco, Menlo, monospace",
		Encoding:          "UTF-8",
		KeepAlive:         30,
		CreatedAt:         now,
		UpdatedAt:         now,
		UseCustomSettings: false,
		BackgroundOpacity: 50,
		BackgroundBlur:    0,
		CursorStyle:       "block",
		CursorBlink:       true,
		LineHeight:        1.2,
		LetterSpacing:     0,
		Scrollback:        10000,
	}
}

// generateSessionID 生成唯一会话 ID
func generateSessionID() string {
	b := make([]byte, 8)
	rand.Read(b)
	return time.Now().Format("20060102150405") + "-" + hex.EncodeToString(b)
}

// defaultPort 获取协议默认端口
func defaultPort(protocol Protocol) int {
	switch protocol {
	case ProtocolSSH:
		return 22
	case ProtocolTelnet:
		return 23
	case ProtocolLocal:
		return 0 // Local 协议不需要端口
	default:
		return 0
	}
}

// Update 更新会话
func (s *Session) Update() {
	s.UpdatedAt = FlexibleTime{Time: time.Now()}
}

// SetLastUsed 设置最后使用时间
func (s *Session) SetLastUsed() {
	s.LastUsedAt = FlexibleTime{Time: time.Now()}
}
