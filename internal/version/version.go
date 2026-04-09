package version

import (
	"fmt"
	"runtime"
	"time"
)

// 构建时注入的变量
var (
	// 版本号，通过 -ldflags 注入
	Version = "dev"
	// 构建时间，通过 -ldflags 注入
	BuildTime = ""
	// Git 提交哈希，通过 -ldflags 注入
	GitCommit = ""
	// Go 版本
	GoVersion = runtime.Version()
)

// AppInfo 应用信息
type AppInfo struct {
	Name        string `json:"name"`
	Version     string `json:"version"`
	BuildTime   string `json:"buildTime"`
	GitCommit   string `json:"gitCommit"`
	GoVersion   string `json:"goVersion"`
	Platform    string `json:"platform"`
	Author      string `json:"author"`
	Email       string `json:"email"`
	Description string `json:"description"`
}

// 常量信息
const (
	AppName        = "Crayon"
	AppAuthor      = "erpan"
	AppEmail       = "erpan.site@gmail.com"
	AppDescription = "A cross-platform terminal manager"
)

// GetInfo 获取应用完整信息
func GetInfo() AppInfo {
	buildTime := BuildTime
	if buildTime == "" {
		buildTime = time.Now().Format("2006-01-02")
	}

	return AppInfo{
		Name:        AppName,
		Version:     Version,
		BuildTime:   buildTime,
		GitCommit:   GitCommit,
		GoVersion:   GoVersion,
		Platform:    fmt.Sprintf("%s/%s", runtime.GOOS, runtime.GOARCH),
		Author:      AppAuthor,
		Email:       AppEmail,
		Description: AppDescription,
	}
}

// GetVersion 获取版本号
func GetVersion() string {
	return Version
}

// GetAppName 获取应用名称
func GetAppName() string {
	return AppName
}