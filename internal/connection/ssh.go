package connection

import (
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"sync"
	"time"

	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/knownhosts"
)

// AuthMethod 认证方法接口
type AuthMethod interface {
	Authenticate() (ssh.AuthMethod, error)
}

// PasswordAuth 密码认证
type PasswordAuth struct {
	Password string
}

func (a *PasswordAuth) Authenticate() (ssh.AuthMethod, error) {
	if a.Password == "" {
		return nil, errors.New("password is empty")
	}
	return ssh.Password(a.Password), nil
}

// KeyAuth 公钥认证
type KeyAuth struct {
	KeyPath       string
	KeyPassphrase string // 密钥密码（可选）
}

func (a *KeyAuth) Authenticate() (ssh.AuthMethod, error) {
	if a.KeyPath == "" {
		return nil, errors.New("key path is empty")
	}

	// 处理 ~ 符号，展开为用户家目录
	keyPath := a.KeyPath
	if len(keyPath) > 0 && keyPath[0] == '~' {
		homeDir, err := os.UserHomeDir()
		if err != nil {
			return nil, fmt.Errorf("failed to get home directory: %w", err)
		}
		keyPath = filepath.Join(homeDir, keyPath[1:])
	}

	// 读取密钥文件内容
	keyBytes, err := os.ReadFile(keyPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read key file: %w", err)
	}

	var signer ssh.Signer
	if a.KeyPassphrase != "" {
		signer, err = ssh.ParsePrivateKeyWithPassphrase(keyBytes, []byte(a.KeyPassphrase))
	} else {
		signer, err = ssh.ParsePrivateKey(keyBytes)
	}
	if err != nil {
		return nil, fmt.Errorf("failed to parse private key: %w", err)
	}

	return ssh.PublicKeys(signer), nil
}

// AgentAuth SSH Agent 认证
type AgentAuth struct{}

func (a *AgentAuth) Authenticate() (ssh.AuthMethod, error) {
	// 使用 SSH Agent 认证
	return ssh.PublicKeysCallback(func() ([]ssh.Signer, error) {
		// 这里需要连接到 SSH Agent，暂时返回错误
		// 完整实现需要 ssh-agent 连接
		return nil, errors.New("SSH Agent authentication not implemented yet")
	}), nil
}

// ConnectionType 连接类型
type ConnectionType string

const (
	ConnectionSSH    ConnectionType = "ssh"
	ConnectionTelnet ConnectionType = "telnet"
	ConnectionSerial ConnectionType = "serial"
	ConnectionLocal  ConnectionType = "local"
)

// ConnectionStatus 连接状态
type ConnectionStatus string

const (
	StatusDisconnected ConnectionStatus = "disconnected"
	StatusConnecting   ConnectionStatus = "connecting"
	StatusConnected    ConnectionStatus = "connected"
	StatusError        ConnectionStatus = "error"
)

// Connection 连接接口
type Connection interface {
	ID() string
	Type() ConnectionType
	Status() ConnectionStatus
	Connect() error
	Disconnect() error
	Send(data []byte) error
	Receive() ([]byte, error)
	Resize(cols, rows int) error
	// NeedLocalEcho 返回是否需要本地回显
	// Telnet 连接根据协商结果返回，SSH 和 Serial 返回 false
	NeedLocalEcho() bool
}

// SSHConnection SSH 连接实现
type SSHConnection struct {
	id             string
	host           string
	port           int
	user           string
	auth           AuthMethod
	client         *ssh.Client
	session        *ssh.Session
	status         ConnectionStatus
	output         io.Reader
	input          io.Writer
	mu             sync.Mutex
	keepAlive      time.Duration
	cols           int
	rows           int
	done           chan struct{}
	knownHostsPath string
}

// SSHConfig SSH 配置
type SSHConfig struct {
	ID             string
	Host           string
	Port           int
	User           string
	Auth           AuthMethod
	KeepAlive      time.Duration // 心跳间隔，0 表示不启用
	Cols           int           // 初始终端宽度
	Rows           int           // 初始终端高度
	KnownHostsPath string        // known_hosts 文件路径，为空则使用默认路径
}

// NewSSHConnection 创建新的 SSH 连接
func NewSSHConnection(config SSHConfig) *SSHConnection {
	if config.Port == 0 {
		config.Port = 22
	}
	if config.KeepAlive == 0 {
		config.KeepAlive = 30 * time.Second
	}
	if config.Cols == 0 {
		config.Cols = 80
	}
	if config.Rows == 0 {
		config.Rows = 24
	}
	return &SSHConnection{
		id:             config.ID,
		host:           config.Host,
		port:           config.Port,
		user:           config.User,
		auth:           config.Auth,
		keepAlive:      config.KeepAlive,
		cols:           config.Cols,
		rows:           config.Rows,
		status:         StatusDisconnected,
		done:           make(chan struct{}),
		knownHostsPath: config.KnownHostsPath,
	}
}

func (c *SSHConnection) ID() string {
	return c.id
}

func (c *SSHConnection) Type() ConnectionType {
	return ConnectionSSH
}

func (c *SSHConnection) Status() ConnectionStatus {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.status
}

func (c *SSHConnection) setStatus(status ConnectionStatus) {
	c.mu.Lock()
	c.status = status
	c.mu.Unlock()
}

// createHostKeyCallback 创建主机密钥验证回调
// 使用 known_hosts 文件进行验证，首次连接自动添加
func (c *SSHConnection) createHostKeyCallback() ssh.HostKeyCallback {
	// 如果没有指定 known_hosts 路径，使用默认路径
	knownHostsPath := c.knownHostsPath
	if knownHostsPath == "" {
		homeDir, err := os.UserHomeDir()
		if err != nil {
			// 无法获取用户目录，使用不安全的方式（向后兼容）
			return ssh.InsecureIgnoreHostKey()
		}
		knownHostsPath = filepath.Join(homeDir, ".ssh", "known_hosts")
	}

	// 确保 known_hosts 文件所在目录存在
	knownHostsDir := filepath.Dir(knownHostsPath)
	if err := os.MkdirAll(knownHostsDir, 0700); err != nil {
		return ssh.InsecureIgnoreHostKey()
	}

	// 尝试创建 known_hosts 文件（如果不存在）
	if _, err := os.Stat(knownHostsPath); os.IsNotExist(err) {
		file, err := os.OpenFile(knownHostsPath, os.O_CREATE, 0600)
		if err != nil {
			return ssh.InsecureIgnoreHostKey()
		}
		file.Close()
	}

	// 创建 known_hosts 回调
	callback, err := knownhosts.New(knownHostsPath)
	if err != nil {
		return ssh.InsecureIgnoreHostKey()
	}

	return func(hostname string, remote net.Addr, key ssh.PublicKey) error {
		err := callback(hostname, remote, key)
		if err == nil {
			return nil // 已知主机，验证通过
		}

		// 检查是否是 "unknown host" 错误
		var keyErr *knownhosts.KeyError
		if errors.As(err, &keyErr) && len(keyErr.Want) == 0 {
			// 首次连接，自动添加主机密钥
			return c.addHostKey(knownHostsPath, hostname, key)
		}

		// 主机密钥变更或其他错误
		return fmt.Errorf("host key verification failed: %w (possible man-in-the-middle attack)", err)
	}
}

// addHostKey 添加主机密钥到 known_hosts 文件
func (c *SSHConnection) addHostKey(knownHostsPath, hostname string, key ssh.PublicKey) error {
	// 格式化主机条目（包含端口）
	var hostEntry string
	if c.port != 22 {
		hostEntry = fmt.Sprintf("[%s]:%d", c.host, c.port)
	} else {
		hostEntry = c.host
	}

	// 追加到 known_hosts 文件
	f, err := os.OpenFile(knownHostsPath, os.O_APPEND|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	defer f.Close()

	line := knownhosts.Line([]string{hostEntry}, key)
	if _, err := fmt.Fprintln(f, line); err != nil {
		return err
	}

	return nil
}

// Connect 建立 SSH 连接
func (c *SSHConnection) Connect() error {
	c.setStatus(StatusConnecting)

	authMethod, err := c.auth.Authenticate()
	if err != nil {
		c.setStatus(StatusError)
		return fmt.Errorf("authentication setup failed: %w", err)
	}

	config := &ssh.ClientConfig{
		User:            c.user,
		Auth:            []ssh.AuthMethod{authMethod},
		HostKeyCallback: c.createHostKeyCallback(),
		Timeout:         10 * time.Second,
	}

	addr := fmt.Sprintf("%s:%d", c.host, c.port)
	client, err := ssh.Dial("tcp", addr, config)
	if err != nil {
		c.setStatus(StatusError)
		return fmt.Errorf("failed to dial: %w", err)
	}

	c.client = client

	// 创建会话
	session, err := client.NewSession()
	if err != nil {
		client.Close()
		c.setStatus(StatusError)
		return fmt.Errorf("failed to create session: %w", err)
	}

	c.session = session

	// 设置终端模式 - 完整的模式设置以支持全屏应用
	modes := ssh.TerminalModes{
		ssh.ECHO:          1,     // 回显
		ssh.ECHOE:         1,     // 回显擦除
		ssh.ECHOK:         1,     // 回显 Kill
		ssh.ECHONL:        0,     // 不回显换行
		ssh.ICANON:        0,     // 原始模式 - 支持全屏应用
		ssh.ISIG:          1,     // 信号字符
		ssh.ICRNL:         1,     // CR 转 NL
		ssh.INLCR:         0,     // 不转换 NL 到 CR
		ssh.IGNCR:         0,     // 不忽略 CR
		ssh.IXON:          0,     // 禁用 XON/XOFF 流控制
		ssh.IXOFF:         0,     // 禁用输出控制
		ssh.TTY_OP_ISPEED: 38400, // 输入速度
		ssh.TTY_OP_OSPEED: 38400, // 输出速度
	}

	//请求 PTY - 使用 xterm-256color 支持颜色
	if err := session.RequestPty("xterm-256color", c.rows, c.cols, modes); err != nil {
		session.Close()
		client.Close()
		c.setStatus(StatusError)
		return fmt.Errorf("failed to request pty: %w", err)
	}

	// 获取输入输出流
	c.output, err = session.StdoutPipe()
	if err != nil {
		session.Close()
		client.Close()
		c.setStatus(StatusError)
		return fmt.Errorf("failed to get stdout pipe: %w", err)
	}

	// 合并 stderr 到 stdout
	stderr, err := session.StderrPipe()
	if err != nil {
		session.Close()
		client.Close()
		c.setStatus(StatusError)
		return fmt.Errorf("failed to get stderr pipe: %w", err)
	}
	c.output = io.MultiReader(c.output, stderr)

	c.input, err = session.StdinPipe()
	if err != nil {
		session.Close()
		client.Close()
		c.setStatus(StatusError)
		return fmt.Errorf("failed to get stdin pipe: %w", err)
	}

	// 启动 shell
	if err := session.Shell(); err != nil {
		session.Close()
		client.Close()
		c.setStatus(StatusError)
		return fmt.Errorf("failed to start shell: %w", err)
	}

	c.setStatus(StatusConnected)

	// 启动心跳保活
	if c.keepAlive > 0 {
		go c.keepAliveLoop()
	}

	return nil
}

// keepAliveLoop 心跳保活循环
func (c *SSHConnection) keepAliveLoop() {
	ticker := time.NewTicker(c.keepAlive)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			c.mu.Lock()
			if c.client == nil || c.status != StatusConnected {
				c.mu.Unlock()
				return
			}
			// 发送 keep-alive 请求
			_, _, err := c.client.SendRequest("keepalive@openssh.com", true, nil)
			c.mu.Unlock()
			if err != nil {
				c.Disconnect()
				return
			}
		case <-c.done:
			return
		}
	}
}

// Disconnect 断开连接
func (c *SSHConnection) Disconnect() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.status == StatusDisconnected {
		return nil
	}

	close(c.done)

	if c.session != nil {
		c.session.Close()
		c.session = nil
	}
	if c.client != nil {
		c.client.Close()
		c.client = nil
	}

	c.status = StatusDisconnected
	return nil
}

// Send 发送数据
func (c *SSHConnection) Send(data []byte) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.status != StatusConnected || c.input == nil {
		return errors.New("connection not established")
	}

	_, err := c.input.Write(data)
	return err
}

// Receive 接收数据
func (c *SSHConnection) Receive() ([]byte, error) {
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
	return buf[:n], nil
}

// Resize调整终端大小
func (c *SSHConnection) Resize(cols, rows int) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.status != StatusConnected || c.session == nil {
		return errors.New("connection not established")
	}

	c.cols = cols
	c.rows = rows
	return c.session.WindowChange(rows, cols)
}

// ExecuteCommand 执行单次命令（非交互式）
func (c *SSHConnection) ExecuteCommand(cmd string) (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.client == nil {
		return "", errors.New("client not connected")
	}

	session, err := c.client.NewSession()
	if err != nil {
		return "", fmt.Errorf("failed to create session: %w", err)
	}
	defer session.Close()

	output, err := session.CombinedOutput(cmd)
	if err != nil {
		return string(output), fmt.Errorf("command execution failed: %w", err)
	}

	return string(output), nil
}

// NeedLocalEcho SSH 连接不需要本地回显，SSH 协议自动处理
func (c *SSHConnection) NeedLocalEcho() bool {
	return false
}
