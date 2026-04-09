package connection

import (
	"errors"
	"sync"
)

// Manager 连接管理器
type Manager struct {
	connections map[string]Connection
	mu          sync.RWMutex
}

// NewManager 创建连接管理器
func NewManager() *Manager {
	return &Manager{
		connections: make(map[string]Connection),
	}
}

// Add 添加连接
func (m *Manager) Add(conn Connection) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, exists := m.connections[conn.ID()]; exists {
		return errors.New("connection already exists")
	}

	m.connections[conn.ID()] = conn
	return nil
}

// Get 获取连接
func (m *Manager) Get(id string) (Connection, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	conn, exists := m.connections[id]
	return conn, exists
}

// Remove 移除连接
func (m *Manager) Remove(id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	conn, exists := m.connections[id]
	if !exists {
		return errors.New("connection not found")
	}

	// 断开连接
	conn.Disconnect()
	delete(m.connections, id)
	return nil
}

// List 获取所有连接
func (m *Manager) List() []Connection {
	m.mu.RLock()
	defer m.mu.RUnlock()

	result := make([]Connection, 0, len(m.connections))
	for _, conn := range m.connections {
		result = append(result, conn)
	}
	return result
}

// ListByStatus 按状态获取连接
func (m *Manager) ListByStatus(status ConnectionStatus) []Connection {
	m.mu.RLock()
	defer m.mu.RUnlock()

	result := make([]Connection, 0)
	for _, conn := range m.connections {
		if conn.Status() == status {
			result = append(result, conn)
		}
	}
	return result
}

// DisconnectAll 断开所有连接
func (m *Manager) DisconnectAll() {
	m.mu.Lock()
	defer m.mu.Unlock()

	for _, conn := range m.connections {
		conn.Disconnect()
	}
	m.connections = make(map[string]Connection)
}

// Count 获取连接数量
func (m *Manager) Count() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.connections)
}

// CountByStatus 按状态统计连接数量
func (m *Manager) CountByStatus(status ConnectionStatus) int {
	m.mu.RLock()
	defer m.mu.RUnlock()

	count := 0
	for _, conn := range m.connections {
		if conn.Status() == status {
			count++
		}
	}
	return count
}