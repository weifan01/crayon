package session

import (
	"encoding/xml"
	"fmt"
	"path/filepath"
	"strconv"
	"strings"
)

// SecureCRTSession 表示从 SecureCRT XML 解析出的会话信息
type SecureCRTSession struct {
	Name     string
	Group    string
	Host     string
	Port     int
	Protocol string
	Username string
	AuthType string // "password" 或 "key"
	KeyPath  string // 转换后的密钥路径
}

// SecureCRT XML 结构定义
type VanDykeConfig struct {
	XMLName xml.Name `xml:"VanDyke"`
	Version string   `xml:"version,attr"`
	Keys    []Key    `xml:"key"`
}

type Key struct {
	Name    string   `xml:"name,attr"`
	Strings []String `xml:"string"`
	Dwords  []Dword  `xml:"dword"`
	Keys    []Key    `xml:"key"`
}

type String struct {
	Name  string `xml:"name,attr"`
	Value string `xml:",chardata"`
}

type Dword struct {
	Name  string `xml:"name,attr"`
	Value string `xml:",chardata"` // 改为 string，后面再转换
}

// ParseSecureCRTXML 解析 SecureCRT 导出的 XML 文件内容
// 返回会话列表、分组列表和错误
func ParseSecureCRTXML(xmlContent string) ([]SecureCRTSession, []string, error) {
	var config VanDykeConfig
	if err := xml.Unmarshal([]byte(xmlContent), &config); err != nil {
		return nil, nil, fmt.Errorf("failed to parse XML: %v", err)
	}

	sessions := []SecureCRTSession{}
	groups := []string{}

	// 找到 Sessions 节点
	for _, key := range config.Keys {
		if key.Name == "Sessions" {
			parseSessionsKey(&key, "", &sessions, &groups)
			break
		}
	}

	return sessions, groups, nil
}

// parseSessionsKey 递归解析会话和分组
func parseSessionsKey(key *Key, parentGroup string, sessions *[]SecureCRTSession, groups *[]string) {
	for _, subKey := range key.Keys {
		// 检查是否是会话（有 Is Session 标记或有 Hostname）
		if isSessionKey(&subKey) {
			session := parseSession(&subKey, parentGroup)
			*sessions = append(*sessions, session)
		} else {
			// 这是一个分组
			groupPath := subKey.Name
			if parentGroup != "" {
				groupPath = parentGroup + "/" + subKey.Name
			}
			*groups = append(*groups, groupPath)
			// 递归解析子节点
			parseSessionsKey(&subKey, groupPath, sessions, groups)
		}
	}
}

// isSessionKey 判断 key 是否是一个会话配置
func isSessionKey(key *Key) bool {
	for _, str := range key.Strings {
		if str.Name == "Hostname" {
			return true
		}
		if str.Name == "Is Session" || str.Name == "Protocol Name" {
			return true
		}
	}
	for _, dw := range key.Dwords {
		if dw.Name == "Is Session" {
			val, _ := strconv.Atoi(dw.Value)
			if val == 1 {
				return true
			}
		}
	}
	return false
}

// parseSession 从 key 中解析会话信息
func parseSession(key *Key, group string) SecureCRTSession {
	session := SecureCRTSession{
		Name:     key.Name,
		Group:    group,
		Port:     22, // 默认 SSH 端口
		Protocol: "ssh",
		AuthType: "password",
	}

	// 解析字符串属性
	for _, str := range key.Strings {
		switch str.Name {
		case "Hostname":
			session.Host = str.Value
		case "Username":
			session.Username = str.Value
		case "Protocol Name":
			if str.Value == "SSH2" || str.Value == "SSH1" {
				session.Protocol = "ssh"
			} else if str.Value == "Telnet" {
				session.Protocol = "telnet"
			}
		case "SSH2 Authentications V2":
			if strings.Contains(str.Value, "publickey") {
				session.AuthType = "key"
			}
		case "Identity Filename V2":
			session.KeyPath = convertKeyPath(str.Value)
		}
	}

	// 解析数值属性
	for _, dw := range key.Dwords {
		switch dw.Name {
		case "[SSH2] Port":
			session.Port, _ = strconv.Atoi(dw.Value)
		case "Port":
			if session.Port == 0 {
				session.Port, _ = strconv.Atoi(dw.Value)
			}
		}
	}

	return session
}

// convertKeyPath 转换 SecureCRT 密钥路径到本地路径
// ${VDS_SSH_DATA_PATH}/ops.key → ~/.ssh/ops.key
func convertKeyPath(originalPath string) string {
	if originalPath == "" {
		return ""
	}

	// 替换 SecureCRT 变量
	path := strings.ReplaceAll(originalPath, "${VDS_SSH_DATA_PATH}", "~/.ssh")
	path = strings.ReplaceAll(path, "${VDS_USER_DATA_PATH}", "~/.ssh")

	// 如果路径仍然包含变量，清空它
	if strings.Contains(path, "${") {
		return ""
	}

	// 提取文件名并构建 ~/.ssh/filename 格式
	if strings.HasPrefix(path, "~/.ssh/") {
		return path
	}

	// 如果是绝对路径或相对路径，只提取文件名
	filename := filepath.Base(path)
	return "~/.ssh/" + filename
}

// ToMap 将 SecureCRTSession 转换为 map 供前端使用
func (s *SecureCRTSession) ToMap() map[string]interface{} {
	return map[string]interface{}{
		"name":      s.Name,
		"group":     s.Group,
		"host":      s.Host,
		"port":      s.Port,
		"protocol":  s.Protocol,
		"user":      s.Username,
		"authType":  s.AuthType,
		"keyPath":   s.KeyPath,
		"password":  "", // 密码清空，连接时手动输入
	}
}