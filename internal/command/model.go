package command

import (
	"regexp"
	"time"
)

// Command 命令定义
type Command struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Group       string    `json:"group"`        // 分组路径
	Description string    `json:"description"`
	Content     string    `json:"content"`      // 命令内容
	Variables   []Variable `json:"variables"`   // 变量定义
	Shortcut    string    `json:"shortcut"`     // 快捷键
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

// Variable 命令变量
type Variable struct {
	Name        string `json:"name"`         // 变量名，如 {service}
	Default     string `json:"default"`      // 默认值
	Description string `json:"description"`  // 描述
}

// CommandGroup 命令分组
type CommandGroup struct {
	ID       string    `json:"id"`
	Name     string    `json:"name"`
	ParentID string    `json:"parentId"`
	Path     string    `json:"path"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// NewCommand 创建新命令
func NewCommand(name, content string) *Command {
	now := time.Now()
	return &Command{
		ID:        generateCommandID(),
		Name:      name,
		Content:   content,
		CreatedAt: now,
		UpdatedAt: now,
	}
}

// generateCommandID 生成命令 ID
func generateCommandID() string {
	return "cmd-" + time.Now().Format("20060102150405")
}

// ApplyVariables 应用变量替换
func (c *Command) ApplyVariables(values map[string]string) string {
	result := c.Content
	for _, v := range c.Variables {
		if val, ok := values[v.Name]; ok {
			result = replaceVariable(result, v.Name, val)
		} else if v.Default != "" {
			result = replaceVariable(result, v.Name, v.Default)
		}
	}
	return result
}

// replaceVariable 替换变量
func replaceVariable(content, name, value string) string {
	re := regexp.MustCompile(regexp.QuoteMeta("{" + name + "}"))
	return re.ReplaceAllString(content, value)
}

// Update 更新命令
func (c *Command) Update() {
	c.UpdatedAt = time.Now()
}

// ParseVariables 从内容中解析变量
func (c *Command) ParseVariables() {
	// 解析 {var} 格式的变量
	c.Variables = []Variable{}
	// 实际实现需要正则解析
}