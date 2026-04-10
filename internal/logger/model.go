package logger

import "time"

// Direction 数据方向
type Direction string

const (
	DirectionInput  Direction = "input"  // 用户输入（发送到远程）
	DirectionOutput Direction = "output" // 远程输出（接收显示）
)

// LogEntry 日志条目
type LogEntry struct {
	Timestamp time.Time `json:"timestamp"` // 时间戳
	Direction Direction `json:"direction"` // 方向：input/output
	Data      string    `json:"data"`      // 数据内容
}

// SessionLog 会话日志
type SessionLog struct {
	TabID        string     `json:"tabId"`        // 标签页/连接 ID（区分同一会话的多个窗口）
	SessionID    string     `json:"sessionId"`    // 会话 ID
	SessionName  string     `json:"sessionName"`  // 会话名称
	Protocol     string     `json:"protocol"`     // 协议类型
	Host         string     `json:"host"`         // 主机地址
	StartTime    time.Time  `json:"startTime"`    // 开始时间
	EndTime      time.Time  `json:"endTime"`      // 结束时间
	LastSaveTime time.Time  `json:"lastSaveTime"` // 上次保存时间
	EndReason    string     `json:"endReason"`    // 结束原因
	Entries      []LogEntry `json:"entries"`      // 日志条目
	InputBuffer  string     // 输入缓冲区（用于合并命令）
	OutputBuffer string     // 输出缓冲区（用于合并输出行）
}

// LogFileInfo 日志文件信息
type LogFileInfo struct {
	WeekDir      string    `json:"weekDir"`      // 周目录名（如 2026-W14）
	Filename     string    `json:"filename"`     // 文件名
	FullPath     string    `json:"fullPath"`     // 完整路径
	Size         int64     `json:"size"`         // 文件大小
	ModifiedTime time.Time `json:"modifiedTime"` // 最后修改时间
}

// sortLogFiles 按修改时间排序日志文件
func sortLogFiles(files []LogFileInfo) {
	for i := 0; i < len(files)-1; i++ {
		for j := i + 1; j < len(files); j++ {
			if files[i].ModifiedTime.Before(files[j].ModifiedTime) {
				files[i], files[j] = files[j], files[i]
			}
		}
	}
}
