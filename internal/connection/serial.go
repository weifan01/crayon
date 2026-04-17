package connection

import (
	"errors"
	"fmt"
	"io"
	"sync"

	"go.bug.st/serial"
)

// SerialConnection Serial 连接实现
type SerialConnection struct {
	id         string
	port       string
	baudRate   int
	dataBits   int
	stopBits   int
	parity     string
	status     ConnectionStatus
	portHandle serial.Port
	output     io.Reader
	input      io.Writer
	mu         sync.Mutex
	cols       int
	rows       int
	done       chan struct{}
}

// SerialConfig Serial 配置
type SerialConfig struct {
	ID       string
	Port     string // 串口路径，如 /dev/ttyUSB0, COM1
	BaudRate int    // 波特率，默认 9600
	DataBits int    // 数据位，默认 8
	StopBits int    // 停止位，默认 1
	Parity   string // 校验位，none/even/odd，默认 none
	Cols     int
	Rows     int
}

// NewSerialConnection 创建新的 Serial 连接
func NewSerialConnection(config SerialConfig) *SerialConnection {
	if config.BaudRate == 0 {
		config.BaudRate = 9600
	}
	if config.DataBits == 0 {
		config.DataBits = 8
	}
	if config.StopBits == 0 {
		config.StopBits = 1
	}
	if config.Parity == "" {
		config.Parity = "none"
	}
	if config.Cols == 0 {
		config.Cols = 80
	}
	if config.Rows == 0 {
		config.Rows = 24
	}
	return &SerialConnection{
		id:       config.ID,
		port:     config.Port,
		baudRate: config.BaudRate,
		dataBits: config.DataBits,
		stopBits: config.StopBits,
		parity:   config.Parity,
		cols:     config.Cols,
		rows:     config.Rows,
		status:   StatusDisconnected,
		done:     make(chan struct{}),
	}
}

func (c *SerialConnection) ID() string {
	return c.id
}

func (c *SerialConnection) Type() ConnectionType {
	return ConnectionSerial
}

func (c *SerialConnection) Status() ConnectionStatus {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.status
}

func (c *SerialConnection) setStatus(status ConnectionStatus) {
	c.mu.Lock()
	c.status = status
	c.mu.Unlock()
}

// Connect 建立 Serial 连接
func (c *SerialConnection) Connect() error {
	c.setStatus(StatusConnecting)

	// 获取校验位设置
	parityMode := serial.NoParity
	switch c.parity {
	case "even":
		parityMode = serial.EvenParity
	case "odd":
		parityMode = serial.OddParity
	}

	// 获取停止位设置
	stopBitsMode := serial.OneStopBit
	if c.stopBits == 2 {
		stopBitsMode = serial.TwoStopBits
	}

	// 打开串口
	mode := &serial.Mode{
		BaudRate: c.baudRate,
		DataBits: c.dataBits,
		StopBits: stopBitsMode,
		Parity:   parityMode,
	}

	port, err := serial.Open(c.port, mode)
	if err != nil {
		c.setStatus(StatusError)
		return fmt.Errorf("failed to open serial port: %w", err)
	}

	c.portHandle = port
	c.output = port
	c.input = port

	c.setStatus(StatusConnected)
	return nil
}

// Disconnect 断开连接
func (c *SerialConnection) Disconnect() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.status == StatusDisconnected {
		return nil
	}

	close(c.done)

	if c.portHandle != nil {
		c.portHandle.Close()
		c.portHandle = nil
	}

	c.status = StatusDisconnected
	return nil
}

// Send 发送数据
func (c *SerialConnection) Send(data []byte) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.status != StatusConnected || c.input == nil {
		return errors.New("connection not established")
	}

	_, err := c.input.Write(data)
	return err
}

// Receive 接收数据
func (c *SerialConnection) Receive() ([]byte, error) {
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

// Resize Serial 不支持终端大小调整
func (c *SerialConnection) Resize(cols, rows int) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.cols = cols
	c.rows = rows
	return nil
}

// NeedLocalEcho Serial 连接默认需要本地回显
// 串口通信通常需要本地回显以显示输入内容
func (c *SerialConnection) NeedLocalEcho() bool {
	return true
}

// GetConnectionInfo 获取连接详情
func (c *SerialConnection) GetConnectionInfo() (map[string]string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.portHandle == nil {
		return nil, errors.New("not connected")
	}

	return map[string]string{
		"port":     c.port,
		"baudRate": fmt.Sprintf("%d", c.baudRate),
	}, nil
}
