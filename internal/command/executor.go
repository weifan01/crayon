package command

import (
	"context"
	"errors"
	"sync"
	"time"

	"github.com/weifan01/crayon/internal/connection"
)

// ExecutionMode 执行模式
type ExecutionMode string

const (
	ModeSync  ExecutionMode = "sync"  // 同步执行，等待所有完成
	ModeAsync ExecutionMode = "async" // 异步执行，不等待
)

// FailureBehavior 失败处理行为
type FailureBehavior string

const (
	FailureContinue FailureBehavior = "continue" // 继续
	FailureStop     FailureBehavior = "stop"     // 停止
	FailureRetry    FailureBehavior = "retry"    // 重试
)

// ExecutionResult 执行结果
type ExecutionResult struct {
	SessionID   string `json:"sessionId"`
	SessionName string `json:"sessionName"`
	Success     bool   `json:"success"`
	Output      string `json:"output"`
	Error       string `json:"error"`
	DurationMs  int64  `json:"durationMs"`
}

// ExecutionRequest 执行请求
type ExecutionRequest struct {
	SessionIDs []string        `json:"sessionIds"`
	Command    string          `json:"command"`
	Mode       ExecutionMode   `json:"mode"`
	TimeoutMs  int64           `json:"timeoutMs"` // 超时时间（毫秒）
	OnFailure  FailureBehavior `json:"onFailure"`
	MaxRetries int             `json:"maxRetries"`
}

// BatchExecutor 批量执行器
type BatchExecutor struct {
	manager *connection.Manager
}

// NewBatchExecutor 创建批量执行器
func NewBatchExecutor(manager *connection.Manager) *BatchExecutor {
	return &BatchExecutor{
		manager: manager,
	}
}

// Execute 执行批量命令
func (e *BatchExecutor) Execute(ctx context.Context, req ExecutionRequest) ([]ExecutionResult, error) {
	if len(req.SessionIDs) == 0 {
		return nil, errors.New("no sessions selected")
	}

	if req.Command == "" {
		return nil, errors.New("command is empty")
	}

	// 设置默认超时（30秒）
	if req.TimeoutMs == 0 {
		req.TimeoutMs = 30000
	}

	results := make([]ExecutionResult, len(req.SessionIDs))
	var wg sync.WaitGroup
	var mu sync.Mutex

	for i, sessionID := range req.SessionIDs {
		wg.Add(1)

		go func(idx int, id string) {
			defer wg.Done()

			result := e.executeSingle(ctx, id, req)
			mu.Lock()
			results[idx] = result
			mu.Unlock()
		}(i, sessionID)
	}

	if req.Mode == ModeSync {
		wg.Wait()
	}

	return results, nil
}

// executeSingle 执行单个会话命令
func (e *BatchExecutor) executeSingle(ctx context.Context, sessionID string, req ExecutionRequest) ExecutionResult {
	conn, exists := e.manager.Get(sessionID)
	if !exists {
		return ExecutionResult{
			SessionID: sessionID,
			Success:   false,
			Error:     "session not connected",
		}
	}

	sshConn, ok := conn.(*connection.SSHConnection)
	if !ok {
		return ExecutionResult{
			SessionID: sessionID,
			Success:   false,
			Error:     "invalid connection type",
		}
	}

	if sshConn.Status() != connection.StatusConnected {
		return ExecutionResult{
			SessionID: sessionID,
			Success:   false,
			Error:     "session not connected",
		}
	}

	start := time.Now()
	timeout := time.Duration(req.TimeoutMs) * time.Millisecond

	// 使用 context 控制超时
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	done := make(chan struct{})
	var output string
	var err error

	go func() {
		output, err = sshConn.ExecuteCommand(req.Command)
		close(done)
	}()

	select {
	case <-done:
		// 命令完成
	case <-ctx.Done():
		// 超时或取消
		return ExecutionResult{
			SessionID:  sessionID,
			Success:    false,
			Error:      "execution timeout",
			DurationMs: time.Since(start).Milliseconds(),
		}
	}

	duration := time.Since(start)

	if err != nil {
		// 失败重试
		if req.OnFailure == FailureRetry && req.MaxRetries > 0 {
			for retry := 0; retry < req.MaxRetries; retry++ {
				output, err = sshConn.ExecuteCommand(req.Command)
				if err == nil {
					break
				}
				time.Sleep(1 * time.Second)
			}
		}
	}

	errStr := ""
	if err != nil {
		errStr = err.Error()
	}

	return ExecutionResult{
		SessionID:   sessionID,
		SessionName: sshConn.ID(),
		Success:     err == nil,
		Output:      output,
		Error:       errStr,
		DurationMs:  duration.Milliseconds(),
	}
}

// ExecuteInteractive 向多个交互式会话发送命令
func (e *BatchExecutor) ExecuteInteractive(sessionIDs []string, command string) []ExecutionResult {
	results := make([]ExecutionResult, len(sessionIDs))

	for i, sessionID := range sessionIDs {
		conn, exists := e.manager.Get(sessionID)
		if !exists {
			results[i] = ExecutionResult{
				SessionID: sessionID,
				Success:   false,
				Error:     "session not found",
			}
			continue
		}

		err := conn.Send([]byte(command + "\n"))
		errStr := ""
		if err != nil {
			errStr = err.Error()
		}
		results[i] = ExecutionResult{
			SessionID: sessionID,
			Success:   err == nil,
			Error:     errStr,
		}
	}

	return results
}
