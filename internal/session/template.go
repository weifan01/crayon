package session

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"time"
)

// PersonalizationTemplate 个性化设置模板
type PersonalizationTemplate struct {
	ID          string       `json:"id"`
	Name        string       `json:"name"`
	Description string       `json:"description"`
	CreatedAt   FlexibleTime `json:"createdAt"`
	UpdatedAt   FlexibleTime `json:"updatedAt"`
	// 个性化设置内容
	UseCustomSettings bool    `json:"useCustomSettings"`
	FontSize          int     `json:"fontSize"`
	FontFamily        string  `json:"fontFamily"`
	ThemeID           string  `json:"themeId"`
	Scrollback        int     `json:"scrollback"`
	BackgroundImage   string  `json:"backgroundImage"`
	BackgroundOpacity int     `json:"backgroundOpacity"`
	BackgroundBlur    int     `json:"backgroundBlur"`
	CursorStyle       string  `json:"cursorStyle"`
	CursorBlink       bool    `json:"cursorBlink"`
	LineHeight        float64 `json:"lineHeight"`
	LetterSpacing     float64 `json:"letterSpacing"`
}

// NewPersonalizationTemplate 创建新的个性化模板
func NewPersonalizationTemplate(name string) *PersonalizationTemplate {
	now := FlexibleTime{Time: time.Now()}
	return &PersonalizationTemplate{
		ID:                generateTemplateID(),
		Name:              name,
		CreatedAt:         now,
		UpdatedAt:         now,
		UseCustomSettings: true,
		FontSize:          14,
		FontFamily:        "Monaco, Menlo, monospace",
		ThemeID:           "starry-night",
		Scrollback:        10000,
		BackgroundOpacity: 50,
		BackgroundBlur:    0,
		CursorStyle:       "block",
		CursorBlink:       true,
		LineHeight:        1.2,
		LetterSpacing:     0,
	}
}

// generateTemplateID 生成唯一模板 ID
func generateTemplateID() string {
	b := make([]byte, 8)
	rand.Read(b)
	return "tpl-" + time.Now().Format("20060102150405") + "-" + hex.EncodeToString(b)
}

// Update 更新模板
func (t *PersonalizationTemplate) Update() {
	t.UpdatedAt = FlexibleTime{Time: time.Now()}
}

// ApplyToSession 将模板应用到会话
func (t *PersonalizationTemplate) ApplyToSession(s *Session) {
	s.TemplateID = t.ID // 记录模板关联
	s.UseCustomSettings = t.UseCustomSettings
	s.FontSize = t.FontSize
	s.FontFamily = t.FontFamily
	s.ThemeID = t.ThemeID
	s.Scrollback = t.Scrollback
	s.BackgroundImage = t.BackgroundImage
	s.BackgroundOpacity = t.BackgroundOpacity
	s.BackgroundBlur = t.BackgroundBlur
	s.CursorStyle = t.CursorStyle
	s.CursorBlink = t.CursorBlink
	s.LineHeight = t.LineHeight
	s.LetterSpacing = t.LetterSpacing
	s.Update()
}

// FromSession 从会话创建模板
func FromSession(name string, description string, s *Session) *PersonalizationTemplate {
	t := NewPersonalizationTemplate(name)
	t.Description = description
	t.UseCustomSettings = s.UseCustomSettings
	t.FontSize = s.FontSize
	t.FontFamily = s.FontFamily
	t.ThemeID = s.ThemeID
	t.Scrollback = s.Scrollback
	t.BackgroundImage = s.BackgroundImage
	t.BackgroundOpacity = s.BackgroundOpacity
	t.BackgroundBlur = s.BackgroundBlur
	t.CursorStyle = s.CursorStyle
	t.CursorBlink = s.CursorBlink
	t.LineHeight = s.LineHeight
	t.LetterSpacing = s.LetterSpacing
	return t
}

// TemplateJSON 用于 JSON 导出
type TemplateJSON struct {
	PersonalizationTemplates []PersonalizationTemplate `json:"personalizationTemplates"`
}

// MarshalJSON 序列化模板列表
func MarshalTemplates(templates []*PersonalizationTemplate) ([]byte, error) {
	data := TemplateJSON{
		PersonalizationTemplates: make([]PersonalizationTemplate, len(templates)),
	}
	for i, t := range templates {
		data.PersonalizationTemplates[i] = *t
	}
	return json.Marshal(data)
}

// UnmarshalTemplates 反序列化模板列表
func UnmarshalTemplates(data []byte) ([]*PersonalizationTemplate, error) {
	var templateJSON TemplateJSON
	if err := json.Unmarshal(data, &templateJSON); err != nil {
		return nil, err
	}
	templates := make([]*PersonalizationTemplate, len(templateJSON.PersonalizationTemplates))
	for i := range templateJSON.PersonalizationTemplates {
		templates[i] = &templateJSON.PersonalizationTemplates[i]
	}
	return templates, nil
}