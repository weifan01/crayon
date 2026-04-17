package connection

import (
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"sync"

	"github.com/creack/pty"
)

// LocalShellConfig 本地shell配置
type LocalShellConfig struct {
	ID         string
	Shell      string // shell类型，如 "bash", "zsh", "powershell", "cmd"
	Cols       int
	Rows       int
	WorkingDir string   // 工作目录
	Env        []string // 环境变量
}

// LocalShellConnection 本地shell连接实现
type LocalShellConnection struct {
	id         string
	shell      string
	status     ConnectionStatus
	ptmx       *os.File
	cmd        *exec.Cmd
	output     io.Reader
	input      io.Writer
	mu         sync.Mutex
	cols       int
	rows       int
	done       chan struct{}
	workingDir string
	env        []string
}

// NewLocalShellConnection 创建新的本地shell连接
func NewLocalShellConnection(config LocalShellConfig) *LocalShellConnection {
	shell := config.Shell
	if shell == "" {
		// 根据操作系统获取默认shell
		shell = getDefaultShell()
	}

	return &LocalShellConnection{
		id:         config.ID,
		shell:      shell,
		status:     StatusDisconnected,
		cols:       config.Cols,
		rows:       config.Rows,
		done:       make(chan struct{}),
		workingDir: config.WorkingDir,
		env:        config.Env,
	}
}

// getDefaultShell 获取系统默认shell
func getDefaultShell() string {
	switch runtime.GOOS {
	case "windows":
		// 检查是否存在 PowerShell
		if _, err := exec.LookPath("powershell"); err == nil {
			return "powershell"
		}
		// 默认使用 cmd
		return "cmd"
	default:
		// Unix-like 系统，默认使用 SHELL 环境变量或 /bin/sh
		if shell := os.Getenv("SHELL"); shell != "" {
			return strings.TrimPrefix(shell, "/bin/")
		}
		return "sh"
	}
}

// ID 返回连接ID
func (c *LocalShellConnection) ID() string {
	return c.id
}

// Type 返回连接类型
func (c *LocalShellConnection) Type() ConnectionType {
	return ConnectionLocal
}

// Status 返回连接状态
func (c *LocalShellConnection) Status() ConnectionStatus {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.status
}

// setStatus 设置连接状态
func (c *LocalShellConnection) setStatus(status ConnectionStatus) {
	c.mu.Lock()
	c.status = status
	c.mu.Unlock()
}

// Connect 建立本地shell连接
func (c *LocalShellConnection) Connect() error {
	c.setStatus(StatusConnecting)

	var cmd *exec.Cmd

	if runtime.GOOS == "windows" {
		// Windows 系统
		if c.shell == "powershell" {
			cmd = exec.Command("powershell.exe", "-NoLogo", "-ExecutionPolicy", "RemoteSigned")
		} else {
			cmd = exec.Command("cmd.exe")
		}
	} else {
		// Unix-like 系统
		cmd = exec.Command(c.shell)
	}

	// 设置工作目录
	if c.workingDir != "" {
		cmd.Dir = c.workingDir
	} else {
		// 默认使用用户家目录
		homeDir, err := os.UserHomeDir()
		if err == nil {
			cmd.Dir = homeDir
		}
	}

	// 设置环境变量
	if len(c.env) > 0 {
		cmd.Env = c.env
	} else {
		cmd.Env = os.Environ()
	}

	// 启动PTY
	ptmx, err := pty.Start(cmd)
	if err != nil {
		c.setStatus(StatusError)
		return fmt.Errorf("failed to start pty: %w", err)
	}

	c.cmd = cmd
	c.ptmx = ptmx
	c.output = ptmx
	c.input = ptmx

	// 调整PTY大小
	if err := pty.Setsize(ptmx, &pty.Winsize{
		Rows: uint16(c.rows),
		Cols: uint16(c.cols),
	}); err != nil {
		ptmx.Close()
		c.setStatus(StatusError)
		return fmt.Errorf("failed to set pty size: %w", err)
	}

	c.setStatus(StatusConnected)

	return nil
}

// Disconnect 断开连接
func (c *LocalShellConnection) Disconnect() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.status == StatusDisconnected {
		return nil
	}

	close(c.done)

	if c.ptmx != nil {
		c.ptmx.Close()
		c.ptmx = nil
	}

	if c.cmd != nil {
		// 尝试优雅退出
		if err := c.cmd.Process.Kill(); err != nil {
			// 忽略错误，继续清理
		}
		// 等待进程退出
		c.cmd.Wait()
		c.cmd = nil
	}

	c.status = StatusDisconnected
	return nil
}

// Send 发送数据到本地shell
func (c *LocalShellConnection) Send(data []byte) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.status != StatusConnected || c.input == nil {
		return errors.New("connection not established")
	}

	_, err := c.input.Write(data)
	return err
}

// Receive 从本地shell接收数据
func (c *LocalShellConnection) Receive() ([]byte, error) {
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

// Resize 调整终端大小
func (c *LocalShellConnection) Resize(cols, rows int) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.status != StatusConnected || c.ptmx == nil {
		return errors.New("connection not established")
	}

	c.cols = cols
	c.rows = rows

	return pty.Setsize(c.ptmx, &pty.Winsize{
		Rows: uint16(rows),
		Cols: uint16(cols),
	})
}

// NeedLocalEcho 本地shell不需要本地回显（shell本身会回显）
func (c *LocalShellConnection) NeedLocalEcho() bool {
	return false
}

// GetConnectionInfo 获取连接详情
func (c *LocalShellConnection) GetConnectionInfo() (map[string]string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.ptmx == nil {
		return nil, errors.New("not connected")
	}

	return map[string]string{
		"shell":      c.shell,
		"workingDir": c.workingDir,
	}, nil
}