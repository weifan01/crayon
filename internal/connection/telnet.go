package connection

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"net"
	"sync"
	"time"
)

// Telnet 命令常量
const (
	IAC  = 0xFF // Interpret As Command
	DONT = 0xFE
	DO   = 0xFD
	WONT = 0xFC
	WILL = 0xFB
	SB   = 0xFA // Subnegotiation Begin
	SE   = 0xF0 // Subnegotiation End

	// Telnet 选项
	OPT_ECHO              = 1
	OPT_SUPPRESS_GO_AHEAD = 3
	OPT_STATUS            = 5
	OPT_TIMING_MARK       = 6
	OPT_TERMINAL_TYPE     = 24
	OPT_WINDOW_SIZE       = 31 // NAWS
	OPT_TERMINAL_SPEED    = 32
	OPT_REMOTE_FLOW       = 33
	OPT_LINEMODE          = 34
	OPT_ENV               = 36
	OPT_NEW_ENV           = 39
)

// TelnetConnection Telnet 连接实现
type TelnetConnection struct {
	id     string
	host   string
	port   int
	status ConnectionStatus
	conn   net.Conn
	output io.Reader
	input  io.Writer
	mu     sync.Mutex
	cols   int
	rows   int
	done   chan struct{}

	// 自动登录配置
	username string
	password string
	timeout  time.Duration

	// 协商状态
	negotiation     bool // 是否进行 Telnet 协商
	serverEcho      bool // 服务器是否回显
	localEcho       bool // 是否需要本地回显
	suppressGoAhead bool
	terminalType    string

	// 回显状态变化回调
	onEchoChange func(needLocalEcho bool)
}

// TelnetConfig Telnet 配置
type TelnetConfig struct {
	ID            string
	Host          string
	Port          int
	Cols          int
	Rows          int
	Username      string
	Password      string
	TerminalType  string
	NoNegotiation bool // 禁用 Telnet 协商，用于连接非 Telnet 服务器
}

// NewTelnetConnection 创建新的 Telnet 连接
func NewTelnetConnection(config TelnetConfig) *TelnetConnection {
	if config.Port == 0 {
		config.Port = 23
	}
	if config.Cols == 0 {
		config.Cols = 80
	}
	if config.Rows == 0 {
		config.Rows = 24
	}
	if config.TerminalType == "" {
		config.TerminalType = "xterm-256color"
	}
	// 默认启用协商（标准 Telnet 行为）
	// 如果 NoNegotiation 为 true 或端口不是标准 Telnet 端口，则禁用协商
	negotiation := !config.NoNegotiation
	if config.Port != 23 {
		// 非标准端口默认禁用协商（可能是 HTTP 或其他服务）
		negotiation = false
	}
	return &TelnetConnection{
		id:           config.ID,
		host:         config.Host,
		port:         config.Port,
		cols:         config.Cols,
		rows:         config.Rows,
		username:     config.Username,
		password:     config.Password,
		terminalType: config.TerminalType,
		negotiation:  negotiation,
		status:       StatusDisconnected,
		done:         make(chan struct{}),
		timeout:      10 * time.Second,
		// 默认启用本地回显，直到服务器明确表示会回显
		localEcho:  true,
		serverEcho: false,
	}
}

func (c *TelnetConnection) ID() string {
	return c.id
}

func (c *TelnetConnection) Type() ConnectionType {
	return ConnectionTelnet
}

func (c *TelnetConnection) Status() ConnectionStatus {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.status
}

func (c *TelnetConnection) setStatus(status ConnectionStatus) {
	c.mu.Lock()
	c.status = status
	c.mu.Unlock()
}

// Connect 建立 Telnet 连接
func (c *TelnetConnection) Connect() error {
	c.setStatus(StatusConnecting)

	addr := fmt.Sprintf("%s:%d", c.host, c.port)
	conn, err := net.DialTimeout("tcp", addr, c.timeout)
	if err != nil {
		c.setStatus(StatusError)
		return fmt.Errorf("failed to connect: %w", err)
	}

	// 设置 TCP_NODELAY 禁用 Nagle 算法，确保数据立即发送
	if tcpConn, ok := conn.(*net.TCPConn); ok {
		tcpConn.SetNoDelay(true)
	}

	c.conn = conn
	c.output = conn
	c.input = conn

	// 仅在启用协商时发送 Telnet 协商命令
	if c.negotiation {
		c.sendInitialNegotiation()
	}

	c.setStatus(StatusConnected)

	// 如果配置了用户名，启动自动登录
	if c.username != "" {
		go c.autoLogin()
	}

	return nil
}

// sendInitialNegotiation 发送初始 Telnet 协商
func (c *TelnetConnection) sendInitialNegotiation() {
	// 发送 WILL SUPPRESS-GO-AHEAD - 告诉服务器我们支持抑制 Go Ahead
	c.sendCommand(IAC, WILL, OPT_SUPPRESS_GO_AHEAD)
	// 发送 DO SUPPRESS-GO-AHEAD - 请求服务器抑制 Go Ahead
	c.sendCommand(IAC, DO, OPT_SUPPRESS_GO_AHEAD)
	// 发送 WILL 终端类型
	c.sendCommand(IAC, WILL, OPT_TERMINAL_TYPE)
	// 发送 WILL NAWS (窗口大小)
	c.sendCommand(IAC, WILL, OPT_WINDOW_SIZE)
	// 发送 DO ECHO - 请求服务器回显
	// 如果服务器同意会回复 WILL ECHO，我们禁用本地回显
	// 如果服务器拒绝或忽略，我们保持本地回显
	c.sendCommand(IAC, DO, OPT_ECHO)
}

// sendCommand 发送 Telnet 命令
func (c *TelnetConnection) sendCommand(cmd ...byte) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.input != nil {
		c.input.Write(cmd)
	}
}

// sendNAWS 发送窗口大小
func (c *TelnetConnection) sendNAWS() {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.input == nil {
		return
	}

	// NAWS 子协商: IAC SB NAWS <width-high> <width-low> <height-high> <height-low> IAC SE
	colsHigh := byte((c.cols >> 8) & 0xFF)
	colsLow := byte(c.cols & 0xFF)
	rowsHigh := byte((c.rows >> 8) & 0xFF)
	rowsLow := byte(c.rows & 0xFF)

	// 注意：如果值是 0xFF，需要转义为 IAC IAC
	cmd := []byte{IAC, SB, OPT_WINDOW_SIZE}
	cmd = append(cmd, c.escapeNAWSValue(colsHigh)...)
	cmd = append(cmd, c.escapeNAWSValue(colsLow)...)
	cmd = append(cmd, c.escapeNAWSValue(rowsHigh)...)
	cmd = append(cmd, c.escapeNAWSValue(rowsLow)...)
	cmd = append(cmd, IAC, SE)

	c.input.Write(cmd)
}

// escapeNAWSValue 转义 NAWS 值中的 0xFF
func (c *TelnetConnection) escapeNAWSValue(b byte) []byte {
	if b == IAC {
		return []byte{IAC, IAC}
	}
	return []byte{b}
}

// sendTerminalType 发送终端类型
func (c *TelnetConnection) sendTerminalType() {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.input == nil || c.terminalType == "" {
		return
	}

	// TERMINAL-TYPE 子协商: IAC SB TERMINAL-TYPE 0 <type> IAC SE
	cmd := []byte{IAC, SB, OPT_TERMINAL_TYPE, 0}
	cmd = append(cmd, []byte(c.terminalType)...)
	cmd = append(cmd, IAC, SE)

	c.input.Write(cmd)
}

// autoLogin 自动登录
func (c *TelnetConnection) autoLogin() {
	if c.username == "" {
		return
	}

	// 等待登录提示的时间
	timeout := time.NewTimer(5 * time.Second)
	defer timeout.Stop()

	// 用于检测登录提示的缓冲
	var buf bytes.Buffer
	tempBuf := make([]byte, 1024)

	for {
		select {
		case <-c.done:
			return
		case <-timeout.C:
			// 超时，直接发送用户名（可能不需要等待提示）
			if c.username != "" {
				c.Send([]byte(c.username + "\r\n"))
				if c.password != "" {
					time.Sleep(500 * time.Millisecond)
					c.Send([]byte(c.password + "\r\n"))
				}
			}
			return
		default:
			// 非阻塞读取
			c.conn.SetReadDeadline(time.Now().Add(100 * time.Millisecond))
			n, err := c.output.(io.Reader).Read(tempBuf)
			if err != nil {
				if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
					continue
				}
				return
			}

			buf.Write(tempBuf[:n])
			data := buf.Bytes()

			// 检测登录提示
			if c.detectLoginPrompt(data) {
				time.Sleep(100 * time.Millisecond)
				c.Send([]byte(c.username + "\r\n"))

				// 如果有密码，等待密码提示
				if c.password != "" {
					buf.Reset()
					time.Sleep(500 * time.Millisecond)
					c.Send([]byte(c.password + "\r\n"))
				}
				return
			}

			// 检测密码提示
			if c.password != "" && c.detectPasswordPrompt(data) {
				time.Sleep(100 * time.Millisecond)
				c.Send([]byte(c.password + "\r\n"))
				return
			}
		}
	}
}

// detectLoginPrompt 检测登录提示
func (c *TelnetConnection) detectLoginPrompt(data []byte) bool {
	prompts := []string{
		"login:",
		"username:",
		"user:",
		"account:",
		"name:",
	}
	dataLower := bytes.ToLower(data)
	for _, p := range prompts {
		if bytes.Contains(dataLower, []byte(p)) {
			return true
		}
	}
	return false
}

// detectPasswordPrompt 检测密码提示
func (c *TelnetConnection) detectPasswordPrompt(data []byte) bool {
	prompts := []string{
		"password:",
		"passwd:",
		"pass:",
	}
	dataLower := bytes.ToLower(data)
	for _, p := range prompts {
		if bytes.Contains(dataLower, []byte(p)) {
			return true
		}
	}
	return false
}

// Disconnect 断开连接
func (c *TelnetConnection) Disconnect() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.status == StatusDisconnected {
		return nil
	}

	close(c.done)

	if c.conn != nil {
		c.conn.Close()
		c.conn = nil
	}

	c.status = StatusDisconnected
	return nil
}

// Send 发送数据，处理 Telnet 协议的换行符和转义
func (c *TelnetConnection) Send(data []byte) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.status != StatusConnected || c.input == nil {
		return errors.New("connection not established")
	}

	// 处理 Telnet 协议要求：
	// 1. CR (\r) 需要转换成 CRLF (\r\n)
	// 2. IAC (0xFF) 需要转义成 IAC IAC
	processed := c.processSendData(data)
	_, err := c.input.Write(processed)
	return err
}

// processSendData 处理发送的数据：转换换行符和转义 IAC
func (c *TelnetConnection) processSendData(data []byte) []byte {
	result := make([]byte, 0, len(data)*2)
	i := 0
	for i < len(data) {
		b := data[i]
		switch b {
		case IAC:
			// IAC 需要转义
			result = append(result, IAC, IAC)
			i++
		case '\r':
			// CR 转换成 CRLF
			result = append(result, '\r', '\n')
			i++
			// 如果后面跟着 LF，跳过它（避免 \r\n 变成 \r\n\n）
			if i < len(data) && data[i] == '\n' {
				i++
			}
		case '\n':
			// 单独的 LF 也转换成 CRLF
			result = append(result, '\r', '\n')
			i++
		default:
			result = append(result, b)
			i++
		}
	}
	return result
}

// Receive 接收数据，处理 Telnet 控制序列
func (c *TelnetConnection) Receive() ([]byte, error) {
	c.mu.Lock()
	output := c.output
	status := c.status
	c.mu.Unlock()

	if status != StatusConnected || output == nil {
		return nil, errors.New("connection not established")
	}

	buf := make([]byte, 4096)
	n, err := output.Read(buf)
	if err != nil {
		if err == io.EOF {
			return nil, err
		}
		return nil, fmt.Errorf("read error: %w", err)
	}

	// 处理 Telnet 控制序列
	data := c.processTelnetControl(buf[:n])
	return data, nil
}

// processTelnetControl 处理 Telnet IAC 控制序列
func (c *TelnetConnection) processTelnetControl(data []byte) []byte {
	// 如果禁用协商，直接返回数据（只处理 0xFF 转义）
	if !c.negotiation {
		result := make([]byte, 0, len(data))
		for i := 0; i < len(data); i++ {
			if data[i] == IAC && i+1 < len(data) && data[i+1] == IAC {
				result = append(result, IAC)
				i++
			} else {
				result = append(result, data[i])
			}
		}
		return result
	}

	result := make([]byte, 0, len(data))
	i := 0

	for i < len(data) {
		if data[i] == IAC {
			if i+1 >= len(data) {
				result = append(result, data[i])
				break
			}
			cmd := data[i+1]

			switch cmd {
			case IAC: // IAC IAC (escaped 0xFF)
				result = append(result, IAC)
				i += 2

			case WILL:
				if i+2 >= len(data) {
					i += 2
					break
				}
				opt := data[i+2]
				c.handleWill(opt)
				i += 3

			case WONT:
				if i+2 >= len(data) {
					i += 2
					break
				}
				opt := data[i+2]
				c.handleWont(opt)
				i += 3

			case DO:
				if i+2 >= len(data) {
					i += 2
					break
				}
				opt := data[i+2]
				c.handleDo(opt)
				i += 3

			case DONT:
				if i+2 >= len(data) {
					i += 2
					break
				}
				opt := data[i+2]
				c.handleDont(opt)
				i += 3

			case SB:
				// 子协商，查找 SE
				end := i + 2
				for end < len(data)-1 {
					if data[end] == IAC && data[end+1] == SE {
						break
					}
					end++
				}
				if end < len(data)-1 {
					// 处理子协商
					c.handleSubnegotiation(data[i+2 : end])
					i = end + 2
				} else {
					i += 2
				}

			default:
				// 跳过其他命令
				i += 2
			}
		} else {
			result = append(result, data[i])
			i++
		}
	}

	return result
}

// handleWill 处理 WILL 命令 (服务器说"我愿意做某事")
func (c *TelnetConnection) handleWill(opt byte) {
	switch opt {
	case OPT_ECHO:
		// 服务器愿意回显用户输入 - 接受
		// 这意味着服务器会将用户输入回显回来，我们不需要本地回显
		c.mu.Lock()
		c.serverEcho = true
		c.localEcho = false
		callback := c.onEchoChange
		c.mu.Unlock()
		c.sendCommand(IAC, DO, opt)
		// 通知前端状态变化
		if callback != nil {
			go callback(false)
		}
	case OPT_SUPPRESS_GO_AHEAD:
		c.suppressGoAhead = true
		c.sendCommand(IAC, DO, opt)
	case OPT_WINDOW_SIZE:
		// 服务器愿意接收窗口大小
		go c.sendNAWS()
	case OPT_TERMINAL_TYPE:
		// 服务器愿意接收终端类型
		go c.sendTerminalType()
	default:
		// 其他选项拒绝
		c.sendCommand(IAC, DONT, opt)
	}
}

// handleWont 处理 WONT 命令
func (c *TelnetConnection) handleWont(opt byte) {
	switch opt {
	case OPT_ECHO:
		// 服务器不愿意回显，我们需要本地回显
		c.mu.Lock()
		c.serverEcho = false
		c.localEcho = true
		callback := c.onEchoChange
		c.mu.Unlock()
		// 通知前端状态变化
		if callback != nil {
			go callback(true)
		}
	}
	c.sendCommand(IAC, DONT, opt)
}

// handleDo 处理 DO 命令
func (c *TelnetConnection) handleDo(opt byte) {
	switch opt {
	case OPT_WINDOW_SIZE:
		// 服务器请求窗口大小，发送 NAWS
		go c.sendNAWS()
	case OPT_TERMINAL_TYPE:
		// 服务器请求终端类型
		go c.sendTerminalType()
	case OPT_ECHO:
		// 服务器请求我们回显 - 拒绝，因为 xterm.js 会本地回显
		// 如果同时回显会造成双重显示
		c.sendCommand(IAC, WONT, opt)
	case OPT_SUPPRESS_GO_AHEAD:
		c.suppressGoAhead = true
		c.sendCommand(IAC, WILL, opt)
	default:
		// 其他选项拒绝
		c.sendCommand(IAC, WONT, opt)
	}
}

// handleDont 处理 DONT 命令
func (c *TelnetConnection) handleDont(opt byte) {
	c.sendCommand(IAC, WONT, opt)
}

// handleSubnegotiation 处理子协商
func (c *TelnetConnection) handleSubnegotiation(data []byte) {
	if len(data) < 1 {
		return
	}

	opt := data[0]
	switch opt {
	case OPT_TERMINAL_TYPE:
		if len(data) > 1 && data[1] == 1 {
			// SEND 请求，回复终端类型
			go c.sendTerminalType()
		}
	}
}

// Resize 调整终端大小
func (c *TelnetConnection) Resize(cols, rows int) error {
	c.mu.Lock()
	c.cols = cols
	c.rows = rows
	c.mu.Unlock()

	// 发送 NAWS 更新窗口大小
	c.sendNAWS()
	return nil
}

// SetTerminalType 设置终端类型
func (c *TelnetConnection) SetTerminalType(termType string) {
	c.mu.Lock()
	c.terminalType = termType
	c.mu.Unlock()
}

// NeedLocalEcho 返回是否需要本地回显
// 当服务器不回显时，前端需要配置 xterm.js 进行本地回显
func (c *TelnetConnection) NeedLocalEcho() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.localEcho
}

// SetOnEchoChange 设置回显状态变化回调
// 当 ECHO 协商完成时调用此回调通知前端
func (c *TelnetConnection) SetOnEchoChange(callback func(needLocalEcho bool)) {
	c.mu.Lock()
	c.onEchoChange = callback
	c.mu.Unlock()
}

// GetConnectionInfo 获取连接详情
func (c *TelnetConnection) GetConnectionInfo() (map[string]string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.conn == nil {
		return nil, errors.New("not connected")
	}

	return map[string]string{
		"remoteAddr": c.conn.RemoteAddr().String(),
		"localAddr":  c.conn.LocalAddr().String(),
	}, nil
}
