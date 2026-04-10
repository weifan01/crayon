package logger

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// Store 日志存储
type Store struct {
	logDir     string
	activeLogs map[string]*SessionLog
	mu         sync.RWMutex
	enabled    bool
	saveTicker *time.Ticker
	stopChan   chan struct{}
	wg         sync.WaitGroup
}

// NewStore 创建日志存储
func NewStore(logDir string) *Store {
	if err := os.MkdirAll(logDir, 0755); err != nil {
		fmt.Printf("[Logger] Failed to create log directory: %v\n", err)
	}

	s := &Store{
		logDir:     logDir,
		activeLogs: make(map[string]*SessionLog),
		enabled:    true,
		stopChan:   make(chan struct{}),
		saveTicker: time.NewTicker(5 * time.Minute),
	}

	// 启动定期保存
	s.wg.Add(1)
	go s.periodicSave()

	return s
}

// periodicSave 定期保存所有活动日志
func (s *Store) periodicSave() {
	defer s.wg.Done()
	for {
		select {
		case <-s.saveTicker.C:
			s.saveAllActive()
		case <-s.stopChan:
			return
		}
	}
}

// saveAllActive 保存所有活动的日志
func (s *Store) saveAllActive() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.enabled {
		return
	}

	for _, log := range s.activeLogs {
		if len(log.Entries) > 0 {
			s.appendToFile(log)
			log.Entries = []LogEntry{}
			log.LastSaveTime = time.Now()
		}
	}
}

// SetEnabled 设置是否启用日志
func (s *Store) SetEnabled(enabled bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.enabled = enabled
}

// StartSession 开始记录会话
func (s *Store) StartSession(tabId, sessionId, sessionName, protocol, host string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.enabled {
		return
	}

	now := time.Now()
	s.activeLogs[tabId] = &SessionLog{
		TabID:        tabId,
		SessionID:    sessionId,
		SessionName:  sessionName,
		Protocol:     protocol,
		Host:         host,
		StartTime:    now,
		LastSaveTime: now,
		Entries:      []LogEntry{},
	}
}

// LogInput 记录输入
func (s *Store) LogInput(tabId, data string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.enabled {
		return
	}

	log, exists := s.activeLogs[tabId]
	if !exists {
		return
	}

	log.InputBuffer += data
	if strings.Contains(data, "\r") || strings.Contains(data, "\n") {
		cmd := cleanCommand(log.InputBuffer)
		if cmd != "" {
			log.Entries = append(log.Entries, LogEntry{
				Timestamp: time.Now(),
				Direction: DirectionInput,
				Data:      cmd,
			})
		}
		log.InputBuffer = ""
	}
}

// LogOutput 记录输出
func (s *Store) LogOutput(tabId, data string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.enabled {
		return
	}

	log, exists := s.activeLogs[tabId]
	if !exists {
		return
	}

	cleaned := filterControlSequences(data)
	if cleaned == "" {
		return
	}

	log.OutputBuffer += cleaned
	if strings.Contains(log.OutputBuffer, "\n") || strings.Contains(log.OutputBuffer, "\r") {
		lines := splitLines(log.OutputBuffer)
		for _, line := range lines {
			if line != "" {
				log.Entries = append(log.Entries, LogEntry{
					Timestamp: time.Now(),
					Direction: DirectionOutput,
					Data:      line,
				})
			}
		}
		log.OutputBuffer = ""
	}
}

// EndSession 结束会话并保存
func (s *Store) EndSession(tabId, reason string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.enabled {
		return
	}

	log, exists := s.activeLogs[tabId]
	if !exists {
		return
	}

	if log.OutputBuffer != "" {
		log.Entries = append(log.Entries, LogEntry{
			Timestamp: time.Now(),
			Direction: DirectionOutput,
			Data:      strings.TrimRight(log.OutputBuffer, " \t\r\n"),
		})
	}

	log.EndTime = time.Now()
	log.EndReason = reason
	s.appendToFile(log)
	s.writeEndMarker(log)
	delete(s.activeLogs, tabId)

	fmt.Printf("[Logger] Session ended: %s (reason: %s)\n", log.SessionName, reason)
}

// Close 关闭日志存储
func (s *Store) Close() {
	close(s.stopChan)
	s.saveTicker.Stop()
	s.wg.Wait()
	s.saveAllActive()
}

// GetLogDir 获取日志目录
func (s *Store) GetLogDir() string {
	return s.logDir
}

// GetLogList 获取日志文件列表
func (s *Store) GetLogList() ([]LogFileInfo, error) {
	var files []LogFileInfo

	entries, err := os.ReadDir(s.logDir)
	if err != nil {
		return nil, err
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		weekDir := filepath.Join(s.logDir, entry.Name())
		logFiles, err := os.ReadDir(weekDir)
		if err != nil {
			continue
		}

		for _, logFile := range logFiles {
			if !strings.HasSuffix(logFile.Name(), ".log") {
				continue
			}

			info, err := logFile.Info()
			if err != nil {
				continue
			}

			files = append(files, LogFileInfo{
				WeekDir:      entry.Name(),
				Filename:     logFile.Name(),
				FullPath:     filepath.Join(weekDir, logFile.Name()),
				Size:         info.Size(),
				ModifiedTime: info.ModTime(),
			})
		}
	}

	sortLogFiles(files)
	return files, nil
}

// ReadLogFile 读取日志文件内容
func (s *Store) ReadLogFile(fullPath string) (string, error) {
	content, err := os.ReadFile(fullPath)
	if err != nil {
		return "", err
	}
	return string(content), nil
}

// ============ 内部方法 ============

func getWeekDir(baseDir string, t time.Time) string {
	year, week := t.ISOWeek()
	return filepath.Join(baseDir, fmt.Sprintf("%d-W%02d", year, week))
}

func getLogFilename(log *SessionLog) string {
	safeName := strings.NewReplacer("/", "_", "\\", "_", ":", "_", " ", "_").Replace(log.SessionName)
	timeStr := log.StartTime.Format("20060102_150405")
	tabIdShort := log.TabID
	if len(tabIdShort) > 8 {
		tabIdShort = tabIdShort[:8]
	}
	return fmt.Sprintf("%s_%s_%s.log", safeName, tabIdShort, timeStr)
}

func (s *Store) appendToFile(log *SessionLog) {
	if len(log.Entries) == 0 {
		return
	}

	dir := getWeekDir(s.logDir, log.StartTime)
	if err := os.MkdirAll(dir, 0755); err != nil {
		fmt.Printf("[Logger] Failed to create log directory: %v\n", err)
		return
	}

	filename := filepath.Join(dir, getLogFilename(log))

	fileExists := false
	if _, err := os.Stat(filename); err == nil {
		fileExists = true
	}

	file, err := os.OpenFile(filename, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		fmt.Printf("[Logger] Failed to open log file: %v\n", err)
		return
	}
	defer file.Close()

	if !fileExists {
		fmt.Fprintf(file, "=== SESSION INFO ===\n")
		fmt.Fprintf(file, "Session: %s\n", log.SessionName)
		fmt.Fprintf(file, "Protocol: %s\n", log.Protocol)
		fmt.Fprintf(file, "Host: %s\n", log.Host)
		fmt.Fprintf(file, "Start: %s\n", log.StartTime.Format(time.RFC3339))
		fmt.Fprintf(file, "TabID: %s\n", log.TabID)
		fmt.Fprintf(file, "====================\n\n")
	}

	for _, entry := range log.Entries {
		ts := entry.Timestamp.Format("15:04:05")
		if entry.Direction == DirectionInput {
			fmt.Fprintf(file, "[%s] >>> %s\n", ts, entry.Data)
		} else {
			fmt.Fprintf(file, "[%s]     %s\n", ts, entry.Data)
		}
	}
}

func (s *Store) writeEndMarker(log *SessionLog) {
	dir := getWeekDir(s.logDir, log.StartTime)
	filename := filepath.Join(dir, getLogFilename(log))

	file, err := os.OpenFile(filename, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return
	}
	defer file.Close()

	fmt.Fprintf(file, "\n=== SESSION END ===\n")
	fmt.Fprintf(file, "End: %s\n", log.EndTime.Format(time.RFC3339))
	fmt.Fprintf(file, "Reason: %s\n", log.EndReason)
	fmt.Fprintf(file, "Duration: %s\n", log.EndTime.Sub(log.StartTime).Round(time.Second))
	fmt.Fprintf(file, "====================\n")
}

// cleanCommand 清理命令中的控制字符
func cleanCommand(cmd string) string {
	var sb strings.Builder
	sb.Grow(len(cmd))

	for i := 0; i < len(cmd); i++ {
		c := cmd[i]
		if c == '\x1b' {
			// 跳过 ANSI 序列
			i++
			if i < len(cmd) && cmd[i] == '[' {
				i++
				for i < len(cmd) && (cmd[i] >= '0' && cmd[i] <= '9' || cmd[i] == ';') {
					i++
				}
				if i < len(cmd) {
					i++
				}
			}
			i--
		} else if c >= 32 || c == '\t' {
			sb.WriteByte(c)
		}
	}

	result := strings.Trim(sb.String(), "\r\n\t ")
	return result
}

// filterControlSequences 过滤控制序列
func filterControlSequences(data string) string {
	var sb strings.Builder
	sb.Grow(len(data))

	for i := 0; i < len(data); i++ {
		c := data[i]
		if c == '\x1b' {
			i++
			if i < len(data) && data[i] == ']' {
				// OSC 序列
				for i < len(data) && data[i] != '\x07' {
					i++
				}
				if i < len(data) {
					i++
				}
				continue
			}
			if i < len(data) && data[i] == '[' {
				i++
				for i < len(data) && (data[i] >= '0' && data[i] <= '9' || data[i] == ';') {
					i++
				}
				if i < len(data) {
					i++
				}
			}
			i--
		} else if c >= 32 || c == '\r' || c == '\n' || c == '\t' {
			sb.WriteByte(c)
		}
	}

	return sb.String()
}

func splitLines(data string) []string {
	data = strings.ReplaceAll(data, "\r\n", "\n")
	data = strings.ReplaceAll(data, "\r", "\n")

	lines := strings.Split(data, "\n")
	result := make([]string, 0, len(lines))
	for _, line := range lines {
		line = strings.TrimRight(line, " \t")
		if line != "" {
			result = append(result, line)
		}
	}
	return result
}
