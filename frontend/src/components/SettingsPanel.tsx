import { useState, useEffect, useRef, useCallback } from 'react'
import { Settings, X, Palette, MousePointer2, Clipboard, Download, Upload, Monitor, Check, Type, ChevronDown, Keyboard, Globe, Columns, Rows, Info, Search, FileText, Shield, AlertCircle, Image, GripHorizontal, Zap, Maximize2, Plus, Edit2, Trash2, ChevronRight, Sliders, Server, Terminal, CheckSquare, FileCheck, Copy } from 'lucide-react'
import { useSettingsStore, formatShortcut, terminalFonts } from '../stores/settingsStore'
import { useSessionStore } from '../stores/sessionStore'
import { useLocale } from '../stores/localeStore'
import { appThemes, AppTheme } from './themes'
import { uiFonts } from '../stores/settingsStore'
import { getAppInfo, AUTHOR_INFO, AI_INFO, AppInfo } from '../version'
import { LogViewer } from './LogViewer'
import { ImportDialog } from './ImportDialog'
import { BackgroundSettingsPanel } from './BackgroundSettingsPanel'
import { BackgroundImageSelector } from './BackgroundImageSelector'
import { api, PersonalizationTemplate, Session } from '../api/wails'
import { SliderInput, ToggleSwitch, SegmentedControl, SettingCard, FontSelector } from './ui'
import { ApplySessionList } from './ApplySessionList'
import { AboutSettings } from './tabs'

interface Props {
  onClose: () => void
}

type TabId = 'terminal' | 'theme' | 'background' | 'templates' | 'shortcuts' | 'data' | 'about'

// 快捷键配置项
const shortcutConfigs = [
  { key: 'openSettings', icon: Settings },
  { key: 'closeTab', icon: X },
  { key: 'nextTab', icon: Palette, labelKey: 'shortcuts.switchTab' },
  { key: 'splitVertical', icon: Columns },
  { key: 'splitHorizontal', icon: Rows },
  { key: 'closePane', icon: X },
  { key: 'quickConnect', icon: Zap },
  { key: 'toggleFullscreen', icon: Maximize2 },
]

// 快捷键捕获组件
function ShortcutRecorder({
  shortcut,
  onChange,
  theme
}: {
  shortcut: string
  onChange: (shortcut: string) => void
  theme: AppTheme
}) {
  const [isRecording, setIsRecording] = useState(false)
  const inputRef = useRef<HTMLDivElement>(null)
  const { t } = useLocale()

  useEffect(() => {
    if (!isRecording) return

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()

      // 构建快捷键字符串
      const parts: string[] = []

      // 按固定顺序添加修饰键（便于比较和显示）
      if (e.ctrlKey) parts.push('Control')
      if (e.metaKey) parts.push('Meta')
      if (e.altKey) parts.push('Alt')
      if (e.shiftKey) parts.push('Shift')

      // 获取按键（排除修饰键）
      const key = e.key
      const isModifier = key === 'Meta' || key === 'Control' || key === 'Shift' || key === 'Alt'

      if (!isModifier) {
        // 单个字符统一大写，特殊键保持原样（如 Tab, Enter）
        parts.push(key.length === 1 ? key.toUpperCase() : key)
      }

      // 必须包含至少一个修饰键和一个普通键才能完成录入
      // 这样可以支持多修饰键组合（如 Control+Shift+Tab）
      if (parts.length >= 2 && !isModifier) {
        const shortcutStr = parts.join('+')
        onChange(shortcutStr)
        setIsRecording(false)
      }
    }

    const handleClickOutside = (e: MouseEvent) => {
      if (inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setIsRecording(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)
    document.addEventListener('mousedown', handleClickOutside)

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isRecording, onChange])

  return (
    <div
      ref={inputRef}
      onClick={() => setIsRecording(true)}
      className={`px-3 py-1.5 rounded-lg text-sm font-mono cursor-pointer transition-colors ${
        isRecording ? 'ring-2 ring-offset-1' : ''
      }`}
      style={{
        backgroundColor: isRecording ? theme.ui.accent : theme.ui.surface2,
        color: isRecording ? theme.ui.surface0 : theme.ui.textPrimary,
        '--tw-ring-color': theme.ui.accent,
        '--tw-ring-offset-color': theme.ui.surface0,
      } as React.CSSProperties}
    >
      {isRecording ? t('shortcuts.recording') : formatShortcut(shortcut)}
    </div>
  )
}

export function SettingsPanel({ onClose }: Props) {
  const { terminalSettings, setTerminalSettings, shortcutSettings, setShortcutSettings, currentTheme, setTheme, getTheme, themes, customThemes, isCustomTheme, createCustomTheme, updateCustomTheme, deleteCustomTheme } = useSettingsStore()
  const { exportConfigWithOptions, previewImport, importConfigWithOptions, confirmDialog } = useSessionStore()
  const { language, setLanguage, t } = useLocale()
  const [activeTab, setActiveTab] = useState<TabId>('terminal')
  const [previewTheme, setPreviewTheme] = useState<AppTheme | null>(null)
  const [showTerminalFontDropdown, setShowTerminalFontDropdown] = useState(false)
  // 主题编辑对话框状态
  const [showThemeEditor, setShowThemeEditor] = useState(false)
  const [editingTheme, setEditingTheme] = useState<AppTheme | null>(null)
  const [isNewTheme, setIsNewTheme] = useState(false)
  const [showUIFontDropdown, setShowUIFontDropdown] = useState(false)
  const [showLogs, setShowLogs] = useState(false)
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [importPreview, setImportPreview] = useState<any>(null)
  const [importData, setImportData] = useState<string>('')
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const terminalFontDropdownRef = useRef<HTMLDivElement>(null)
  const uiFontDropdownRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const theme = getTheme()

  // 模板管理状态
  const [templates, setTemplates] = useState<PersonalizationTemplate[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<PersonalizationTemplate | null>(null)
  const [showTemplateEdit, setShowTemplateEdit] = useState(false)
  const [editTemplate, setEditTemplate] = useState<Partial<PersonalizationTemplate>>({})
  const [isTemplateNew, setIsTemplateNew] = useState(false)
  const [templateError, setTemplateError] = useState('')
  const [templateSaving, setTemplateSaving] = useState(false)
  const [expandedTemplateSections, setExpandedTemplateSections] = useState<Set<string>>(new Set(['font', 'theme', 'cursor', 'style', 'background', 'scrollback']))
  // 批量应用状态
  const [showApplyDialog, setShowApplyDialog] = useState(false)
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set())
  const [expandedApplyGroups, setExpandedApplyGroups] = useState<Set<string>>(new Set(['ungrouped']))

  // 拖动相关状态
  const [position, setPosition] = useState({ x: 0, y: 0 })
  // 拖动状态（使用 ref 同步跟踪，防止 click 事件在 mouseup 后触发）
  const [isDragging, setIsDragging] = useState(false)
  const isDraggingRef = useRef(false)
  const lastDragEndRef = useRef(0) // 记录拖动结束时间戳
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 })

  // 宽度缩放状态（使用 ref 同步跟踪）
  const [panelWidth, setPanelWidth] = useState(800)
  const [isResizingWidth, setIsResizingWidth] = useState(false)
  const isResizingWidthRef = useRef(false)
  const lastResizeEndRef = useRef(0) // 记录缩放结束时间戳
  const widthResizeStartRef = useRef({ startX: 0, startWidth: 0 })
  const userResizedRef = useRef(false) // 记录用户是否手动调整过宽度

  // 根据内容自适应宽度
  useEffect(() => {
    // 如果用户手动调整过宽度，保持用户设置
    if (userResizedRef.current) return

    // 模板编辑页需要更大宽度
    if (activeTab === 'templates' && showTemplateEdit) {
      setPanelWidth(1000)
    } else if (activeTab === 'templates' && selectedTemplate && !showTemplateEdit) {
      // 模板详情页也需要较大宽度
      setPanelWidth(900)
    } else {
      // 其他页面默认宽度
      setPanelWidth(800)
    }
  }, [activeTab, showTemplateEdit, selectedTemplate])

  // 拖动开始
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    setIsDragging(true)
    isDraggingRef.current = true
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      posX: position.x,
      posY: position.y,
    }
  }, [position])

  // 拖动中
  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStartRef.current.x
      const dy = e.clientY - dragStartRef.current.y
      const newX = dragStartRef.current.posX + dx
      const newY = dragStartRef.current.posY + dy

      // 限制对话框位置，确保至少有一部分在屏幕内
      const minX = -panelWidth + 100
      const maxX = window.innerWidth - 100
      const minY = 0
      const maxY = window.innerHeight - 100

      setPosition({
        x: Math.max(minX, Math.min(maxX, newX)),
        y: Math.max(minY, Math.min(maxY, newY)),
      })
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      isDraggingRef.current = false
      lastDragEndRef.current = Date.now() // 记录结束时间
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, panelWidth])

  // 宽度缩放处理
  useEffect(() => {
    if (!isResizingWidth) return

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - widthResizeStartRef.current.startX
      const newWidth = Math.min(Math.max(widthResizeStartRef.current.startWidth + dx, 600), 1200)
      setPanelWidth(newWidth)
    }

    const handleMouseUp = () => {
      setIsResizingWidth(false)
      isResizingWidthRef.current = false
      lastResizeEndRef.current = Date.now() // 记录结束时间
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizingWidth])

  // 开始宽度缩放
  const handleWidthResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizingWidth(true)
    isResizingWidthRef.current = true
    userResizedRef.current = true // 标记用户手动调整过
    widthResizeStartRef.current = {
      startX: e.clientX,
      startWidth: panelWidth,
    }
  }, [panelWidth])

  // 获取应用信息
  useEffect(() => {
    getAppInfo().then(setAppInfo)
  }, [])

  // 加载模板
  useEffect(() => {
    if (activeTab === 'templates') {
      loadTemplates()
    }
  }, [activeTab])

  const loadTemplates = async () => {
    try {
      const list = await api.listTemplates()
      setTemplates(list || [])
    } catch (e) {
      console.error('Failed to load templates:', e)
      setTemplates([])
    }
  }

  // 主题编辑处理函数
  const handleCopyTheme = (sourceTheme: AppTheme) => {
    const newId = `custom-${sourceTheme.id}-${Date.now()}`
    const newTheme: AppTheme = {
      ...sourceTheme,
      id: newId,
      name: `${sourceTheme.name} (${t('theme.copy')})`,
      author: 'User',
      description: `${t('theme.copySuccess')}: ${sourceTheme.name}`,
    }
    createCustomTheme(newTheme)  // createCustomTheme 已经会自动应用主题
  }

  const handleEditTheme = (theme: AppTheme) => {
    setIsNewTheme(false)
    setEditingTheme({ ...theme })
    setShowThemeEditor(true)
  }

  const handleDeleteTheme = async (themeId: string) => {
    const confirmed = await confirmDialog(t('theme.confirmDelete'), '')
    if (confirmed) {
      deleteCustomTheme(themeId)
    }
  }

  const handleSaveTheme = () => {
    if (!editingTheme) return
    if (!editingTheme.name.trim()) {
      alert(t('common.nameRequired'))
      return
    }
    if (isNewTheme) {
      createCustomTheme(editingTheme)
    } else {
      updateCustomTheme(editingTheme)
    }
    setShowThemeEditor(false)
    setEditingTheme(null)
  }

  const handleNewTemplate = () => {
    setIsTemplateNew(true)
    setEditTemplate({
      name: '',
      description: '',
      useCustomSettings: true,
      fontSize: 14,
      fontFamily: terminalFonts[0]?.value || 'Monaco, Menlo, monospace',
      themeId: 'starry-night',
      scrollback: 10000,
      backgroundOpacity: 50,
      backgroundBlur: 0,
      cursorStyle: 'block',
      cursorBlink: true,
      lineHeight: 1.2,
      letterSpacing: 0,
    })
    setShowTemplateEdit(true)
    setTemplateError('')
  }

  const handleEditTemplate = (tpl: PersonalizationTemplate) => {
    setIsTemplateNew(false)
    setEditTemplate({ ...tpl })
    setSelectedTemplate(tpl)
    setShowTemplateEdit(true)
    setTemplateError('')
  }

  const handleSaveTemplate = async () => {
    if (!editTemplate.name) {
      setTemplateError(t('common.nameRequired'))
      return
    }

    setTemplateSaving(true)
    try {
      if (isTemplateNew) {
        await api.createTemplate(editTemplate)
      } else if (editTemplate.id) {
        await api.updateTemplate(editTemplate as PersonalizationTemplate)
        // 模板更新后刷新会话列表，让已打开的终端能获取最新设置
        await useSessionStore.getState().loadSessions()
      }
      await loadTemplates()
      setShowTemplateEdit(false)
      if (!isTemplateNew) {
        setSelectedTemplate(editTemplate as PersonalizationTemplate)
      }
    } catch (e) {
      setTemplateError(String(e))
    }
    setTemplateSaving(false)
  }

  const handleDeleteTemplate = async (tpl: PersonalizationTemplate) => {
    const confirmed = await api.confirmDialog(t('common.confirm'), t('templates.deleteConfirm').replace('{name}', tpl.name))
    if (!confirmed) return

    try {
      await api.deleteTemplate(tpl.id)
      await loadTemplates()
      if (selectedTemplate?.id === tpl.id) {
        setSelectedTemplate(null)
      }
    } catch (e) {
      console.error('Failed to delete template:', e)
    }
  }

  const toggleTemplateSection = (section: string) => {
    setExpandedTemplateSections(prev => {
      const newSet = new Set(prev)
      if (newSet.has(section)) {
        newSet.delete(section)
      } else {
        newSet.add(section)
      }
      return newSet
    })
  }

  // 批量应用功能
  const sessions = useSessionStore.getState().sessions

  const toggleSessionSelection = (sessionId: string) => {
    setSelectedSessions(prev => {
      const newSet = new Set(prev)
      if (newSet.has(sessionId)) {
        newSet.delete(sessionId)
      } else {
        newSet.add(sessionId)
      }
      return newSet
    })
  }

  const selectAllSessions = () => {
    setSelectedSessions(new Set(sessions.map(s => s.id)))
  }

  const clearSelectedSessions = () => {
    setSelectedSessions(new Set())
  }

  const handleApplyTemplate = async () => {
    if (!selectedTemplate || selectedSessions.size === 0) return

    try {
      await api.applyTemplateToSessions(selectedTemplate.id, Array.from(selectedSessions))
      setShowApplyDialog(false)
      setSelectedSessions(new Set())
      // 刷新会话列表
      useSessionStore.getState().loadSessions()
    } catch (e) {
      console.error('Failed to apply template:', e)
    }
  }

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (terminalFontDropdownRef.current && !terminalFontDropdownRef.current.contains(e.target as Node)) {
        setShowTerminalFontDropdown(false)
      }
      if (uiFontDropdownRef.current && !uiFontDropdownRef.current.contains(e.target as Node)) {
        setShowUIFontDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleExport = async (includeSensitive: boolean) => {
    try {
      const data = await exportConfigWithOptions(includeSensitive)

      if (!data) {
        throw new Error('No data returned from export')
      }

      const filename = `crayon-config-${new Date().toISOString().slice(0, 10)}.json`
      const savePath = await api.saveFile('保存配置文件', filename, '')

      if (!savePath) {
        return
      }

      await api.writeFileString(savePath, data)
      setShowExportDialog(false)
      alert(t('data.exportSuccess') + '\n' + savePath)
    } catch (e) {
      console.error('Export error:', e)
      alert(t('data.exportFailed') + ': ' + e)
    }
  }

  const handleImport = async () => {
    try {
      const filePath = await api.selectFile('选择配置文件', '', 'JSON Files:*.json')

      if (!filePath) {
        return
      }

      const text = await api.readFileString(filePath)

      if (!text) {
        throw new Error('Failed to read file content')
      }

      const preview = await previewImport(text)
      setImportData(text)
      setImportPreview(preview)
      setShowImportDialog(true)
    } catch (e) {
      console.error('Import preview error:', e)
      alert(t('data.importFailed') + ': ' + e)
    }
  }

  const handleImportConfirm = async (options: any) => {
    try {
      await importConfigWithOptions(importData, options)
      setShowImportDialog(false)
      setImportPreview(null)
      setImportData('')
      alert(t('data.importSuccess'))
      window.location.reload()
    } catch (e) {
      console.error('Import error:', e)
      alert(t('data.importFailed') + ': ' + e)
    }
  }

  const tabs = [
    { id: 'terminal' as TabId, label: t('settings.terminal'), icon: Monitor },
    { id: 'theme' as TabId, label: t('settings.theme'), icon: Palette },
    { id: 'background' as TabId, label: t('settings.background'), icon: Image },
    { id: 'templates' as TabId, label: t('templates.title'), icon: Sliders },
    { id: 'shortcuts' as TabId, label: t('settings.shortcuts'), icon: Keyboard },
    { id: 'data' as TabId, label: t('settings.data'), icon: Download },
    { id: 'about' as TabId, label: t('settings.about'), icon: Info },
  ]

  const displayTheme = previewTheme || appThemes.find(t => t.id === currentTheme) || appThemes[0]

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50">
      <div
        ref={panelRef}
        className="dialog-panel max-h-[85vh] overflow-hidden flex relative"
        style={{
          position: 'fixed',
          left: position.x + (window.innerWidth - panelWidth) / 2,
          top: position.y + 80,
          width: `${panelWidth}px`,
        }}
      >
        {/* 左侧导航 */}
        <div className="w-48 p-4 flex flex-col bg-surface-1 border-r border-surface-2">
          {/* 拖动手柄 */}
          <div
            className="flex items-center gap-2 mb-6 cursor-move select-none text-text-muted"
            onMouseDown={handleMouseDown}
          >
            <GripHorizontal size={16} />
            <span className="text-xs">{t('settings.dragToMove')}</span>
          </div>

          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: theme.ui.textPrimary }}>
            <Settings size={20} style={{ color: theme.ui.accent }} />
            {t('settings.title')}
          </h2>

          <nav className="space-y-1 flex-1">
            {tabs.map(tab => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors"
                  style={{
                    backgroundColor: activeTab === tab.id ? theme.ui.surface2 : 'transparent',
                    color: activeTab === tab.id ? theme.ui.textPrimary : theme.ui.textSecondary
                  }}
                >
                  <Icon size={18} />
                  <span className="text-sm font-medium">{tab.label}</span>
                </button>
              )
            })}
          </nav>

          <button
            onClick={onClose}
            className="mt-4 w-full px-3 py-2 rounded-lg text-sm transition-colors"
            style={{
              backgroundColor: theme.ui.surface2,
              color: theme.ui.textSecondary
            }}
          >
            {t('common.close')}
          </button>
        </div>

        {/* 右侧内容 */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* 终端设置 */}
          {activeTab === 'terminal' && (
            <div className="flex-1 overflow-y-auto p-6">
              {/* 语言设置 */}
              <h3 className="text-sm font-medium mb-4" style={{ color: theme.ui.textSecondary }}>
                {t('settings.language')}
              </h3>
              <div className="space-y-3 mb-6">
                <div
                  className="flex items-center justify-between p-4 rounded-xl"
                  style={{ backgroundColor: theme.ui.surface1 }}
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg" style={{ backgroundColor: theme.ui.surface2 }}>
                      <Globe size={18} style={{ color: theme.ui.accent }} />
                    </div>
                    <div>
                      <div className="font-medium" style={{ color: theme.ui.textPrimary }}>{t('settings.language')}</div>
                    </div>
                  </div>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value as 'zh' | 'en')}
                    className="px-3 py-2 rounded-lg text-sm outline-none"
                    style={{
                      backgroundColor: theme.ui.surface2,
                      color: theme.ui.textPrimary,
                      border: `1px solid ${theme.ui.border}`
                    }}
                  >
                    <option value="zh">{t('settings.language.zh')}</option>
                    <option value="en">{t('settings.language.en')}</option>
                  </select>
                </div>
              </div>

              <h3 className="text-sm font-medium mb-4" style={{ color: theme.ui.textSecondary }}>
                {t('terminal.copyOnSelect')}
              </h3>

              <div className="space-y-3">
                <div
                  className="flex items-center justify-between p-4 rounded-xl"
                  style={{ backgroundColor: theme.ui.surface1 }}
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg" style={{ backgroundColor: theme.ui.surface2 }}>
                      <Clipboard size={18} style={{ color: theme.ui.accent }} />
                    </div>
                    <div>
                      <div className="font-medium" style={{ color: theme.ui.textPrimary }}>{t('terminal.copyOnSelect')}</div>
                      <div className="text-xs mt-0.5" style={{ color: theme.ui.textMuted }}>
                        {t('terminal.copyOnSelectDesc')}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setTerminalSettings({ copyOnSelect: !terminalSettings.copyOnSelect })}
                    className="relative w-11 h-6 rounded-full transition-colors duration-200"
                    style={{ backgroundColor: terminalSettings.copyOnSelect ? theme.ui.accent : theme.ui.surface3 }}
                  >
                    <div
                      className="absolute top-1 w-4 h-4 rounded-full transition-transform duration-200"
                      style={{
                        backgroundColor: '#fff',
                        transform: terminalSettings.copyOnSelect ? 'translateX(22px)' : 'translateX(4px)'
                      }}
                    />
                  </button>
                </div>

                <div
                  className="flex items-center justify-between p-4 rounded-xl"
                  style={{ backgroundColor: theme.ui.surface1 }}
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg" style={{ backgroundColor: theme.ui.surface2 }}>
                      <MousePointer2 size={18} style={{ color: theme.ui.accent }} />
                    </div>
                    <div>
                      <div className="font-medium" style={{ color: theme.ui.textPrimary }}>{t('terminal.pasteOnRightClick')}</div>
                      <div className="text-xs mt-0.5" style={{ color: theme.ui.textMuted }}>
                        {t('terminal.pasteOnRightClickDesc')}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setTerminalSettings({ pasteOnRightClick: !terminalSettings.pasteOnRightClick })}
                    className="relative w-11 h-6 rounded-full transition-colors duration-200"
                    style={{ backgroundColor: terminalSettings.pasteOnRightClick ? theme.ui.accent : theme.ui.surface3 }}
                  >
                    <div
                      className="absolute top-1 w-4 h-4 rounded-full transition-transform duration-200"
                      style={{
                        backgroundColor: '#fff',
                        transform: terminalSettings.pasteOnRightClick ? 'translateX(22px)' : 'translateX(4px)'
                      }}
                    />
                  </button>
                </div>
              </div>

              <h3 className="text-sm font-medium mb-4 mt-6" style={{ color: theme.ui.textSecondary }}>
                {t('terminal.fontSettings')}
              </h3>

              <div className="space-y-3">
                {/* 终端字体 */}
                <div
                  className="p-4 rounded-xl"
                  style={{ backgroundColor: theme.ui.surface1 }}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 rounded-lg" style={{ backgroundColor: theme.ui.surface2 }}>
                      <Type size={18} style={{ color: theme.ui.accent }} />
                    </div>
                    <div>
                      <div className="font-medium" style={{ color: theme.ui.textPrimary }}>{t('terminal.fontFamily')}</div>
                      <div className="text-xs mt-0.5" style={{ color: theme.ui.textMuted }}>
                        {t('terminal.fontFamilyDesc')}
                      </div>
                    </div>
                  </div>
                  <div className="relative" ref={terminalFontDropdownRef}>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={terminalSettings.fontFamily}
                        onChange={(e) => setTerminalSettings({ fontFamily: e.target.value })}
                        placeholder={t('terminal.fontPlaceholder')}
                        className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
                        style={{
                          backgroundColor: theme.ui.surface2,
                          color: theme.ui.textPrimary,
                          border: `1px solid ${theme.ui.border}`
                        }}
                      />
                      <button
                        onClick={() => setShowTerminalFontDropdown(!showTerminalFontDropdown)}
                        className="px-3 py-2 rounded-lg flex items-center gap-1"
                        style={{ backgroundColor: theme.ui.surface2, color: theme.ui.textPrimary }}
                      >
                        <span className="text-sm">{t('terminal.fontSettings')}</span>
                        <ChevronDown size={14} />
                      </button>
                    </div>
                    {showTerminalFontDropdown && (
                      <div
                        className="absolute top-full left-0 right-0 mt-1 rounded-lg shadow-lg overflow-hidden z-10"
                        style={{ backgroundColor: theme.ui.surface1, border: `1px solid ${theme.ui.border}` }}
                      >
                        {terminalFonts.map(font => (
                          <div
                            key={font.value}
                            className="px-3 py-2 text-sm cursor-pointer hover:bg-opacity-80"
                            style={{
                              backgroundColor: terminalSettings.fontFamily === font.value ? theme.ui.surface2 : 'transparent',
                              color: theme.ui.textPrimary
                            }}
                            onClick={() => {
                              setTerminalSettings({ fontFamily: font.value })
                              setShowTerminalFontDropdown(false)
                            }}
                          >
                            {font.label}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* 终端字体大小 */}
                <div
                  className="p-4 rounded-xl"
                  style={{ backgroundColor: theme.ui.surface1 }}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 rounded-lg" style={{ backgroundColor: theme.ui.surface2 }}>
                      <Monitor size={18} style={{ color: theme.ui.accent }} />
                    </div>
                    <div>
                      <div className="font-medium" style={{ color: theme.ui.textPrimary }}>{t('terminal.fontSize')}</div>
                      <div className="text-xs mt-0.5" style={{ color: theme.ui.textMuted }}>
                        {t('terminal.fontSizeDesc')}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="10"
                      max="32"
                      value={terminalSettings.fontSize}
                      onChange={(e) => setTerminalSettings({ fontSize: parseInt(e.target.value) })}
                      className="flex-1 h-2 rounded-full appearance-none cursor-pointer"
                      style={{
                        background: `linear-gradient(to right, ${theme.ui.accent} 0%, ${theme.ui.accent} ${((terminalSettings.fontSize - 10) / 22) * 100}%, ${theme.ui.surface3} ${((terminalSettings.fontSize - 10) / 22) * 100}%, ${theme.ui.surface3} 100%)`
                      }}
                    />
                    <input
                      type="number"
                      min="10"
                      max="32"
                      value={terminalSettings.fontSize}
                      onChange={(e) => {
                        const val = parseInt(e.target.value)
                        if (val >= 10 && val <= 32) {
                          setTerminalSettings({ fontSize: val })
                        }
                      }}
                      className="w-16 px-2 py-1 rounded-lg text-sm text-center outline-none"
                      style={{
                        backgroundColor: theme.ui.surface2,
                        color: theme.ui.textPrimary,
                        border: `1px solid ${theme.ui.border}`
                      }}
                    />
                    <span className="text-sm" style={{ color: theme.ui.textSecondary }}>px</span>
                  </div>
                </div>

                {/* 界面字体 */}
                <div
                  className="p-4 rounded-xl"
                  style={{ backgroundColor: theme.ui.surface1 }}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 rounded-lg" style={{ backgroundColor: theme.ui.surface2 }}>
                      <Type size={18} style={{ color: theme.ui.accent }} />
                    </div>
                    <div>
                      <div className="font-medium" style={{ color: theme.ui.textPrimary }}>{t('terminal.uiFontFamily')}</div>
                      <div className="text-xs mt-0.5" style={{ color: theme.ui.textMuted }}>
                        {t('terminal.uiFontFamilyDesc')}
                      </div>
                    </div>
                  </div>
                  <div className="relative" ref={uiFontDropdownRef}>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={terminalSettings.uiFontFamily}
                        onChange={(e) => setTerminalSettings({ uiFontFamily: e.target.value })}
                        placeholder={t('terminal.uiFontPlaceholder')}
                        className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
                        style={{
                          backgroundColor: theme.ui.surface2,
                          color: theme.ui.textPrimary,
                          border: `1px solid ${theme.ui.border}`
                        }}
                      />
                      <button
                        onClick={() => setShowUIFontDropdown(!showUIFontDropdown)}
                        className="px-3 py-2 rounded-lg flex items-center gap-1"
                        style={{ backgroundColor: theme.ui.surface2, color: theme.ui.textPrimary }}
                      >
                        <span className="text-sm">{t('terminal.fontSettings')}</span>
                        <ChevronDown size={14} />
                      </button>
                    </div>
                    {showUIFontDropdown && (
                      <div
                        className="absolute top-full left-0 right-0 mt-1 rounded-lg shadow-lg overflow-hidden z-10"
                        style={{ backgroundColor: theme.ui.surface1, border: `1px solid ${theme.ui.border}` }}
                      >
                        {uiFonts.map(font => (
                          <div
                            key={font.value}
                            className="px-3 py-2 text-sm cursor-pointer hover:bg-opacity-80"
                            style={{
                              backgroundColor: terminalSettings.uiFontFamily === font.value ? theme.ui.surface2 : 'transparent',
                              color: theme.ui.textPrimary
                            }}
                            onClick={() => {
                              setTerminalSettings({ uiFontFamily: font.value })
                              setShowUIFontDropdown(false)
                            }}
                          >
                            {font.label}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 搜索框位置 */}
              <div
                className="flex items-center justify-between p-4 rounded-xl"
                style={{ backgroundColor: theme.ui.surface1 }}
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg" style={{ backgroundColor: theme.ui.surface2 }}>
                    <Search size={18} style={{ color: theme.ui.accent }} />
                  </div>
                  <div>
                    <div className="font-medium" style={{ color: theme.ui.textPrimary }}>{t('search.position')}</div>
                    <div className="text-xs mt-0.5" style={{ color: theme.ui.textMuted }}>
                      {t('terminal.searchBarPositionDesc')}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1 p-1 rounded-lg" style={{ backgroundColor: theme.ui.surface2 }}>
                  <button
                    onClick={() => setTerminalSettings({ searchBarPosition: 'top' })}
                    className="px-3 py-1 rounded text-sm transition-colors"
                    style={{
                      backgroundColor: terminalSettings.searchBarPosition === 'top' ? theme.ui.accent : 'transparent',
                      color: terminalSettings.searchBarPosition === 'top' ? '#fff' : theme.ui.textMuted,
                    }}
                  >
                    {t('search.positionTop')}
                  </button>
                  <button
                    onClick={() => setTerminalSettings({ searchBarPosition: 'bottom' })}
                    className="px-3 py-1 rounded text-sm transition-colors"
                    style={{
                      backgroundColor: terminalSettings.searchBarPosition === 'bottom' ? theme.ui.accent : 'transparent',
                      color: terminalSettings.searchBarPosition === 'bottom' ? '#fff' : theme.ui.textMuted,
                    }}
                  >
                    {t('search.positionBottom')}
                  </button>
                </div>
              </div>

              <div
                className="mt-6 p-4 rounded-xl text-sm"
                style={{ backgroundColor: theme.ui.surface1, color: theme.ui.textMuted }}
              >
                💡 {t('terminal.fontTip')}
              </div>
            </div>
          )}

          {/* 主题设置 */}
          {activeTab === 'theme' && (
            <div className="flex-1 overflow-y-auto">
              <div className="p-6">
                <h3 className="text-sm font-medium mb-4" style={{ color: theme.ui.textSecondary }}>
                  {t('theme.selectTheme')}
                </h3>

                <div className="grid grid-cols-2 gap-3 mb-6">
                  {themes.map(th => {
                    const isSelected = currentTheme === th.id
                    const isCustom = isCustomTheme(th.id)
                    return (
                      <div
                        key={th.id}
                        className={`p-3 rounded-xl cursor-pointer transition-all duration-150 border-2 ${isSelected ? 'ring-2 ring-offset-2' : ''}`}
                        style={{
                          backgroundColor: th.ui.surface1,
                          borderColor: isSelected ? th.ui.accent : th.ui.border,
                          '--tw-ring-color': th.ui.accent,
                          '--tw-ring-offset-color': theme.ui.surface0,
                        } as React.CSSProperties}
                        onClick={() => setTheme(th.id)}
                        onMouseEnter={() => setPreviewTheme(th)}
                        onMouseLeave={() => setPreviewTheme(null)}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium" style={{ color: th.ui.textPrimary }}>{th.name}</span>
                            {isCustom && (
                              <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: th.ui.accent + '20', color: th.ui.accent }}>
                                {t('theme.customTheme')}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            {isSelected && <Check size={14} style={{ color: th.ui.accent }} />}
                            {/* 复制按钮 - 所有主题都可以复制 */}
                            <button
                              onClick={(e) => { e.stopPropagation(); handleCopyTheme(th) }}
                              className="p-1 rounded opacity-60 hover:opacity-100"
                              style={{ color: th.ui.textMuted }}
                              title={t('theme.copy')}
                            >
                              <Copy size={14} />
                            </button>
                            {/* 编辑按钮 - 仅自定义主题 */}
                            {isCustom && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleEditTheme(th) }}
                                className="p-1 rounded opacity-60 hover:opacity-100"
                                style={{ color: th.ui.textMuted }}
                                title={t('theme.edit')}
                              >
                                <Edit2 size={14} />
                              </button>
                            )}
                            {/* 删除按钮 - 仅自定义主题 */}
                            {isCustom && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDeleteTheme(th.id) }}
                                className="p-1 rounded opacity-60 hover:opacity-100 hover:text-red-400"
                                style={{ color: th.ui.textMuted }}
                                title={t('theme.delete')}
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          {[th.terminal.background, th.terminal.red, th.terminal.green, th.terminal.yellow, th.terminal.blue, th.terminal.magenta, th.terminal.cyan, th.terminal.white].map((color, idx) => (
                            <div key={idx} className="w-3 h-4 rounded" style={{ backgroundColor: color }} />
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div
                  className="p-4 rounded-xl text-sm"
                  style={{ backgroundColor: theme.ui.surface1, color: theme.ui.textMuted }}
                >
                  💡 {t('theme.colorLegend')}
                </div>
              </div>

              {/* 终端预览 */}
              <div
                className="p-6"
                style={{ backgroundColor: theme.ui.surface1 }}
              >
                <h3 className="text-sm font-medium mb-3" style={{ color: theme.ui.textSecondary }}>
                  {t('theme.preview')}
                </h3>
                <div
                  className="p-4 rounded-xl font-mono text-sm min-h-[80px]"
                  style={{
                    backgroundColor: displayTheme.terminal.background,
                    fontFamily: terminalSettings.fontFamily,
                    fontSize: `${terminalSettings.fontSize}px`
                  }}
                >
                  <div className="mb-1">
                    <span style={{ color: displayTheme.terminal.green }}>user</span>
                    <span style={{ color: displayTheme.terminal.white }}>@</span>
                    <span style={{ color: displayTheme.terminal.blue }}>server</span>
                    <span style={{ color: displayTheme.terminal.white }}>:</span>
                    <span style={{ color: displayTheme.terminal.cyan }}>~</span>
                    <span style={{ color: displayTheme.terminal.white }}>$ </span>
                    <span style={{ color: displayTheme.terminal.yellow }}>ls</span>
                    <span style={{ color: displayTheme.terminal.white }}> -la</span>
                  </div>
                  <div style={{ color: displayTheme.terminal.white }}>
                    <span style={{ color: displayTheme.terminal.cyan }}>drwxr-xr-x</span>
                    {'  2 user user 4096 Jan  1 '}
                    <span style={{ color: displayTheme.terminal.blue }}>Documents</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 主题编辑对话框 */}
          {showThemeEditor && editingTheme && (
            <div
              className="dialog-panel flex flex-col"
              style={{
                position: 'fixed',
                left: (window.innerWidth - 600) / 2,
                top: 80,
                width: 600,
                maxHeight: '85vh',
                zIndex: 1001,
              }}
            >
              <div className="p-4 border-b border-surface-2 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2">
                  <Palette size={20} />
                  {isNewTheme ? t('theme.newTheme') : t('theme.editTheme')}
                </h3>
                <button onClick={() => setShowThemeEditor(false)} className="p-1 hover:bg-surface-2 rounded text-text-muted" style={{ cursor: 'pointer' }}>
                  <X size={18} />
                </button>
              </div>
              <div className="p-4 overflow-y-auto flex-1">
                {/* 基本信息 */}
                <div className="mb-4 space-y-3">
                  <div>
                    <label className="block text-sm text-text-secondary mb-1">{t('theme.themeName')} *</label>
                    <input
                      value={editingTheme.name}
                      onChange={(e) => setEditingTheme({ ...editingTheme, name: e.target.value })}
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-text-secondary mb-1">{t('theme.themeDescription')}</label>
                    <input
                      value={editingTheme.description}
                      onChange={(e) => setEditingTheme({ ...editingTheme, description: e.target.value })}
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-text-secondary mb-1">{t('theme.author')}</label>
                    <input
                      value={editingTheme.author}
                      onChange={(e) => setEditingTheme({ ...editingTheme, author: e.target.value })}
                      className="input-field"
                    />
                  </div>
                </div>

                {/* 终端颜色 */}
                <div className="mb-4">
                  <h4 className="text-sm font-medium text-text-secondary mb-2">{t('theme.terminalColors')}</h4>
                  <div className="grid grid-cols-4 gap-3">
                    {[
                      { key: 'background', label: t('theme.background') },
                      { key: 'foreground', label: t('theme.foreground') },
                      { key: 'cursor', label: t('theme.cursor') },
                      { key: 'selectionBackground', label: t('theme.selection') },
                      { key: 'black', label: 'Black' },
                      { key: 'red', label: 'Red' },
                      { key: 'green', label: 'Green' },
                      { key: 'yellow', label: 'Yellow' },
                      { key: 'blue', label: 'Blue' },
                      { key: 'magenta', label: 'Magenta' },
                      { key: 'cyan', label: 'Cyan' },
                      { key: 'white', label: 'White' },
                      { key: 'brightBlack', label: 'Bright Black' },
                      { key: 'brightRed', label: 'Bright Red' },
                      { key: 'brightGreen', label: 'Bright Green' },
                      { key: 'brightYellow', label: 'Bright Yellow' },
                      { key: 'brightBlue', label: 'Bright Blue' },
                      { key: 'brightMagenta', label: 'Bright Magenta' },
                      { key: 'brightCyan', label: 'Bright Cyan' },
                      { key: 'brightWhite', label: 'Bright White' },
                    ].map(({ key, label }) => (
                      <div key={key}>
                        <label className="block text-xs text-text-muted mb-1">{label}</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={editingTheme.terminal[key as keyof typeof editingTheme.terminal]}
                            onChange={(e) => setEditingTheme({
                              ...editingTheme,
                              terminal: { ...editingTheme.terminal, [key]: e.target.value }
                            })}
                            className="w-8 h-8 rounded cursor-pointer"
                          />
                          <input
                            value={editingTheme.terminal[key as keyof typeof editingTheme.terminal]}
                            onChange={(e) => setEditingTheme({
                              ...editingTheme,
                              terminal: { ...editingTheme.terminal, [key]: e.target.value }
                            })}
                            className="input-field text-xs flex-1"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* UI颜色 */}
                <div className="mb-4">
                  <h4 className="text-sm font-medium text-text-secondary mb-2">{t('theme.uiColors')}</h4>
                  <div className="grid grid-cols-4 gap-3">
                    {[
                      { key: 'surface0', label: 'Surface 0' },
                      { key: 'surface1', label: 'Surface 1' },
                      { key: 'surface2', label: 'Surface 2' },
                      { key: 'surface3', label: 'Surface 3' },
                      { key: 'textPrimary', label: 'Text Primary' },
                      { key: 'textSecondary', label: 'Text Secondary' },
                      { key: 'textMuted', label: 'Text Muted' },
                      { key: 'accent', label: 'Accent' },
                      { key: 'accentHover', label: 'Accent Hover' },
                      { key: 'success', label: 'Success' },
                      { key: 'warning', label: 'Warning' },
                      { key: 'error', label: 'Error' },
                      { key: 'info', label: 'Info' },
                      { key: 'border', label: 'Border' },
                    ].map(({ key, label }) => (
                      <div key={key}>
                        <label className="block text-xs text-text-muted mb-1">{label}</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={editingTheme.ui[key as 'surface0' | 'surface1' | 'surface2' | 'surface3' | 'textPrimary' | 'textSecondary' | 'textMuted' | 'accent' | 'accentHover' | 'success' | 'warning' | 'error' | 'info' | 'border']}
                            onChange={(e) => setEditingTheme({
                              ...editingTheme,
                              ui: { ...editingTheme.ui, [key]: e.target.value }
                            })}
                            className="w-8 h-8 rounded cursor-pointer"
                          />
                          <input
                            value={editingTheme.ui[key as 'surface0' | 'surface1' | 'surface2' | 'surface3' | 'textPrimary' | 'textSecondary' | 'textMuted' | 'accent' | 'accentHover' | 'success' | 'warning' | 'error' | 'info' | 'border']}
                            onChange={(e) => setEditingTheme({
                              ...editingTheme,
                              ui: { ...editingTheme.ui, [key]: e.target.value }
                            })}
                            className="input-field text-xs flex-1"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="p-4 border-t border-surface-2 flex justify-end gap-3">
                <button onClick={() => setShowThemeEditor(false)} className="btn btn-secondary">{t('common.cancel')}</button>
                <button onClick={handleSaveTheme} className="btn btn-primary">{t('common.save')}</button>
              </div>
            </div>
          )}

          {/* 快捷键设置 */}
          {activeTab === 'shortcuts' && (
            <div className="flex-1 overflow-y-auto p-6">
              <h3 className="text-sm font-medium mb-4" style={{ color: theme.ui.textSecondary }}>
                {t('shortcuts.title')}
              </h3>

              <div className="space-y-3">
                {shortcutConfigs.map((config, index) => {
                  const Icon = config.icon
                  const labelKey = config.labelKey || `shortcuts.${config.key}`
                  const descKey = `${config.key}Desc`
                  const shortcutValue = shortcutSettings[config.key as keyof typeof shortcutSettings]

                  return (
                    <div
                      key={config.key}
                      className="p-4 rounded-xl"
                      style={{ backgroundColor: theme.ui.surface1 }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg" style={{ backgroundColor: theme.ui.surface2 }}>
                            <Icon size={18} style={{ color: theme.ui.accent }} />
                          </div>
                          <div>
                            <div className="font-medium" style={{ color: theme.ui.textPrimary }}>{t(labelKey)}</div>
                            <div className="text-xs mt-0.5" style={{ color: theme.ui.textMuted }}>
                              {t(`shortcuts.${descKey}`)}
                            </div>
                          </div>
                        </div>
                        <ShortcutRecorder
                          shortcut={shortcutValue}
                          onChange={(newShortcut) => setShortcutSettings({ [config.key]: newShortcut })}
                          theme={theme}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>

              <div
                className="mt-6 p-4 rounded-xl text-sm"
                style={{ backgroundColor: theme.ui.surface1, color: theme.ui.textMuted }}
              >
                💡 {t('shortcuts.tip')}
              </div>
            </div>
          )}

          {/* 背景设置 */}
          {activeTab === 'background' && (
            <div className="flex-1 overflow-y-auto p-6">
              <h3 className="text-sm font-medium mb-4" style={{ color: theme.ui.textSecondary }}>
                {t('background.title')}
              </h3>
              <BackgroundSettingsPanel />
            </div>
          )}

          {/* 模板设置 */}
          {activeTab === 'templates' && (
            <div className="flex-1 overflow-y-auto">
              <div className="flex h-full">
                {/* 左侧模板列表 */}
                <div
                  className="w-1/3 overflow-y-auto"
                  style={{
                    borderRight: `1px solid ${theme.ui.border}`,
                    backgroundColor: theme.ui.surface1,
                  }}
                >
                  <div
                    className="px-4 py-3 flex items-center justify-between"
                    style={{ backgroundColor: theme.ui.surface2, borderBottom: `1px solid ${theme.ui.border}` }}
                  >
                    <span className="text-sm font-medium" style={{ color: theme.ui.textPrimary }}>
                      {templates.length} {t('templates.count')}
                    </span>
                    <button
                      onClick={handleNewTemplate}
                      className="px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 transition-colors"
                      style={{ backgroundColor: theme.ui.accent, color: '#fff' }}
                    >
                      <Plus size={14} />
                      {t('templates.new')}
                    </button>
                  </div>
                  {templates.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12" style={{ color: theme.ui.textMuted }}>
                      <Palette size={32} className="mb-2 opacity-50" />
                      <span className="text-xs">{t('templates.noTemplates')}</span>
                    </div>
                  ) : (
                    templates.map(tpl => (
                      <button
                        key={tpl.id}
                        onClick={() => setSelectedTemplate(tpl)}
                        className="w-full px-4 py-3 flex items-center justify-between text-left transition-colors"
                        style={{
                          backgroundColor: selectedTemplate?.id === tpl.id ? theme.ui.accent + '20' : 'transparent',
                          borderBottom: `1px solid ${theme.ui.border}`,
                        }}
                      >
                        <div className="flex-1">
                          <div className="text-sm font-medium" style={{ color: theme.ui.textPrimary }}>{tpl.name}</div>
                          {tpl.description && (
                            <div className="text-xs mt-1 truncate" style={{ color: theme.ui.textMuted }}>{tpl.description}</div>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleEditTemplate(tpl) }}
                            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                            style={{ color: theme.ui.textMuted }}
                          >
                            <Edit2 size={12} />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteTemplate(tpl) }}
                            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                            style={{ color: theme.ui.textMuted }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </button>
                    ))
                  )}
                </div>

                {/* 右侧详情/编辑 */}
                <div className="flex-1 overflow-y-auto p-4">
                  {showTemplateEdit ? (
                    <div className="space-y-4">
                      {templateError && (
                        <div className="p-3 rounded-xl" style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                          {templateError}
                        </div>
                      )}

                      {/* 基本信息 */}
                      <div className="p-4 rounded-xl" style={{ backgroundColor: theme.ui.surface1 }}>
                        <div className="flex items-center gap-3 mb-4">
                          <div className="p-2 rounded-lg" style={{ backgroundColor: theme.ui.surface2 }}>
                            <Palette size={18} style={{ color: theme.ui.accent }} />
                          </div>
                          <span className="font-medium" style={{ color: theme.ui.textPrimary }}>
                            {isTemplateNew ? t('templates.new') : t('templates.edit')}
                          </span>
                        </div>
                        <div className="space-y-3">
                          <div>
                            <label className="block text-sm mb-2" style={{ color: theme.ui.textSecondary }}>{t('common.name')} *</label>
                            <input
                              value={editTemplate.name || ''}
                              onChange={(e) => setEditTemplate({ ...editTemplate, name: e.target.value })}
                              className="w-full px-3 py-2 rounded-lg text-sm"
                              style={{ backgroundColor: theme.ui.surface2, color: theme.ui.textPrimary, border: `1px solid ${theme.ui.border}` }}
                              placeholder={t('templates.namePlaceholder')}
                            />
                          </div>
                          <div>
                            <label className="block text-sm mb-2" style={{ color: theme.ui.textSecondary }}>{t('common.description')}</label>
                            <input
                              value={editTemplate.description || ''}
                              onChange={(e) => setEditTemplate({ ...editTemplate, description: e.target.value })}
                              className="w-full px-3 py-2 rounded-lg text-sm"
                              style={{ backgroundColor: theme.ui.surface2, color: theme.ui.textPrimary, border: `1px solid ${theme.ui.border}` }}
                              placeholder={t('templates.descPlaceholder')}
                            />
                          </div>
                        </div>
                      </div>

                      {/* 字体设置 */}
                      <SettingCard
                        icon={<Type size={18} style={{ color: theme.ui.accent }} />}
                        title={t('session.fontSettings')}
                        themeOverride={theme}
                      >
                        <div className="grid grid-cols-2 gap-4">
                          <SliderInput
                            value={editTemplate.fontSize || 14}
                            onChange={(v) => setEditTemplate({ ...editTemplate, fontSize: v })}
                            min={10}
                            max={32}
                            unit="px"
                            label={t('terminal.fontSize')}
                          />
                          <FontSelector
                            value={editTemplate.fontFamily || ''}
                            onChange={(v) => setEditTemplate({ ...editTemplate, fontFamily: v })}
                            fonts={terminalFonts}
                            label={t('terminal.fontFamily')}
                          />
                        </div>
                      </SettingCard>

                      {/* 主题设置 */}
                      <div className="p-4 rounded-xl" style={{ backgroundColor: theme.ui.surface1 }}>
                        <div className="flex items-center gap-3 mb-4">
                          <div className="p-2 rounded-lg" style={{ backgroundColor: theme.ui.surface2 }}>
                            <Server size={18} style={{ color: theme.ui.accent }} />
                          </div>
                          <span className="font-medium" style={{ color: theme.ui.textPrimary }}>{t('session.themeSettings')}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          {themes.map(th => (
                            <button
                              key={th.id}
                              onClick={() => setEditTemplate({ ...editTemplate, themeId: th.id })}
                              className="p-3 rounded-lg flex items-center gap-2 transition-colors"
                              style={{
                                backgroundColor: editTemplate.themeId === th.id ? theme.ui.accent + '20' : theme.ui.surface2,
                                border: `2px solid ${editTemplate.themeId === th.id ? theme.ui.accent : theme.ui.border}`,
                              }}
                            >
                              <div className="flex gap-1">
                                {[th.terminal.background, th.terminal.red, th.terminal.green, th.terminal.blue].map((c, i) => (
                                  <div key={i} className="w-3 h-3 rounded" style={{ backgroundColor: c }} />
                                ))}
                              </div>
                              <span className="text-sm" style={{ color: theme.ui.textPrimary }}>{th.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 光标设置 */}
                      <SettingCard
                        icon={<Terminal size={18} style={{ color: theme.ui.accent }} />}
                        title={t('session.cursorSettings')}
                        themeOverride={theme}
                      >
                        <div className="flex items-center justify-between">
                          <SegmentedControl
                            value={editTemplate.cursorStyle || 'block'}
                            onChange={(v) => setEditTemplate({ ...editTemplate, cursorStyle: v as 'block' | 'underline' | 'bar' })}
                            options={[
                              { value: 'block', label: t('session.cursorStyle.block') },
                              { value: 'underline', label: t('session.cursorStyle.underline') },
                              { value: 'bar', label: t('session.cursorStyle.bar') },
                            ]}
                          />
                          <div className="flex items-center gap-3">
                            <span className="text-sm" style={{ color: theme.ui.textSecondary }}>{t('session.cursorBlink')}</span>
                            <ToggleSwitch
                              value={editTemplate.cursorBlink ?? true}
                              onChange={(v) => setEditTemplate({ ...editTemplate, cursorBlink: v })}
                              size="small"
                            />
                          </div>
                        </div>
                      </SettingCard>

                      {/* 样式设置 */}
                      <SettingCard
                        icon={<Sliders size={18} style={{ color: theme.ui.accent }} />}
                        title={t('session.styleSettings')}
                        themeOverride={theme}
                      >
                        <div className="grid grid-cols-2 gap-4">
                          <SliderInput
                            value={editTemplate.lineHeight || 1.2}
                            onChange={(v) => setEditTemplate({ ...editTemplate, lineHeight: v })}
                            min={1}
                            max={2}
                            step={0.1}
                            label={t('session.lineHeight')}
                          />
                          <SliderInput
                            value={editTemplate.letterSpacing || 0}
                            onChange={(v) => setEditTemplate({ ...editTemplate, letterSpacing: v })}
                            min={0}
                            max={10}
                            step={0.5}
                            unit="px"
                            label={t('session.letterSpacing')}
                          />
                        </div>
                      </SettingCard>

                      {/* 背景设置 */}
                      <div className="p-4 rounded-xl" style={{ backgroundColor: theme.ui.surface1 }}>
                        <div className="flex items-center gap-3 mb-4">
                          <div className="p-2 rounded-lg" style={{ backgroundColor: theme.ui.surface2 }}>
                            <Image size={18} style={{ color: theme.ui.accent }} />
                          </div>
                          <span className="font-medium" style={{ color: theme.ui.textPrimary }}>{t('session.backgroundSettings')}</span>
                        </div>
                        <BackgroundImageSelector
                          selected={editTemplate.backgroundImage || ''}
                          onSelect={(filename) => setEditTemplate({ ...editTemplate, backgroundImage: filename })}
                          opacity={editTemplate.backgroundOpacity || 50}
                          blur={editTemplate.backgroundBlur || 0}
                          onOpacityChange={(value) => setEditTemplate({ ...editTemplate, backgroundOpacity: value })}
                          onBlurChange={(value) => setEditTemplate({ ...editTemplate, backgroundBlur: value })}
                        />
                      </div>

                      {/* 滚动缓冲区设置 */}
                      <div className="p-4 rounded-xl" style={{ backgroundColor: theme.ui.surface1 }}>
                        <div className="flex items-center gap-3 mb-4">
                          <div className="p-2 rounded-lg" style={{ backgroundColor: theme.ui.surface2 }}>
                            <MousePointer2 size={18} style={{ color: theme.ui.accent }} />
                          </div>
                          <span className="font-medium" style={{ color: theme.ui.textPrimary }}>{t('session.scrollbackSettings')}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <label className="text-sm" style={{ color: theme.ui.textSecondary }}>{t('session.scrollback')}</label>
                          <input
                            type="number"
                            min="100"
                            max="50000"
                            value={editTemplate.scrollback || 10000}
                            onChange={(e) => setEditTemplate({ ...editTemplate, scrollback: parseInt(e.target.value) })}
                            className="w-20 px-3 py-2 rounded-lg text-sm"
                            style={{ backgroundColor: theme.ui.surface2, color: theme.ui.textPrimary, border: `1px solid ${theme.ui.border}` }}
                          />
                          <span className="text-xs" style={{ color: theme.ui.textMuted }}>{t('session.scrollbackHint')}</span>
                        </div>
                      </div>

                      {/* 操作按钮 */}
                      <div className="flex justify-end gap-3 pt-2">
                        <button
                          onClick={() => setShowTemplateEdit(false)}
                          className="px-4 py-2 rounded-lg text-sm transition-colors"
                          style={{ backgroundColor: theme.ui.surface2, color: theme.ui.textPrimary }}
                        >
                          {t('common.cancel')}
                        </button>
                        <button
                          onClick={handleSaveTemplate}
                          disabled={templateSaving}
                          className="px-4 py-2 rounded-lg text-sm transition-colors"
                          style={{ backgroundColor: theme.ui.accent, color: '#fff', opacity: templateSaving ? 0.7 : 1 }}
                        >
                          {templateSaving ? t('common.saving') : t('common.save')}
                        </button>
                      </div>
                    </div>
                  ) : selectedTemplate ? (
                    <div className="space-y-4">
                      {/* 模板信息 */}
                      <div className="p-4 rounded-xl" style={{ backgroundColor: theme.ui.surface1 }}>
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-medium" style={{ color: theme.ui.textPrimary }}>{selectedTemplate.name}</h3>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setShowApplyDialog(true)}
                              className="px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 transition-colors"
                              style={{ backgroundColor: theme.ui.accent, color: '#fff' }}
                            >
                              <CheckSquare size={14} />
                              {t('templates.applyToSessions')}
                            </button>
                            <button
                              onClick={() => handleEditTemplate(selectedTemplate)}
                              className="px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 transition-colors"
                              style={{ backgroundColor: theme.ui.surface2, color: theme.ui.textPrimary }}
                            >
                              <Edit2 size={14} />
                              {t('common.edit')}
                            </button>
                          </div>
                        </div>
                        {selectedTemplate.description && (
                          <p className="text-sm" style={{ color: theme.ui.textMuted }}>{selectedTemplate.description}</p>
                        )}
                      </div>

                      {/* 配置摘要 */}
                      <div className="p-4 rounded-xl" style={{ backgroundColor: theme.ui.surface1 }}>
                        <div className="flex items-center gap-3 mb-3">
                          <div className="p-2 rounded-lg" style={{ backgroundColor: theme.ui.surface2 }}>
                            <Palette size={16} style={{ color: theme.ui.accent }} />
                          </div>
                          <span className="text-sm font-medium" style={{ color: theme.ui.textPrimary }}>{t('templates.configSummary')}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          {/* 字体 */}
                          <div className="p-3 rounded-lg" style={{ backgroundColor: theme.ui.surface2 }}>
                            <div className="text-xs font-medium mb-1" style={{ color: theme.ui.textMuted }}>{t('session.fontSettings')}</div>
                            <div className="text-sm" style={{ color: theme.ui.textPrimary }}>
                              {selectedTemplate.fontSize}px · {selectedTemplate.fontFamily?.split(',')[0]}
                            </div>
                          </div>
                          {/* 主题 */}
                          <div className="p-3 rounded-lg" style={{ backgroundColor: theme.ui.surface2 }}>
                            <div className="text-xs font-medium mb-1" style={{ color: theme.ui.textMuted }}>{t('session.themeSettings')}</div>
                            <div className="flex items-center gap-2">
                              {(() => {
                                const th = appThemes.find(t => t.id === selectedTemplate.themeId)
                                return th ? (
                                  <>
                                    <div className="flex gap-1">
                                      {[th.terminal.background, th.terminal.red, th.terminal.green].map((c, i) => (
                                        <div key={i} className="w-2 h-2 rounded" style={{ backgroundColor: c }} />
                                      ))}
                                    </div>
                                    <span className="text-sm" style={{ color: theme.ui.textPrimary }}>{th.name}</span>
                                  </>
                                ) : <span className="text-sm" style={{ color: theme.ui.textMuted }}>{t('session.useGlobalSettings')}</span>
                              })()}
                            </div>
                          </div>
                          {/* 光标 */}
                          <div className="p-3 rounded-lg" style={{ backgroundColor: theme.ui.surface2 }}>
                            <div className="text-xs font-medium mb-1" style={{ color: theme.ui.textMuted }}>{t('session.cursorSettings')}</div>
                            <div className="text-sm" style={{ color: theme.ui.textPrimary }}>
                              {t(`session.cursorStyle.${selectedTemplate.cursorStyle}`)}
                              {selectedTemplate.cursorBlink && ` · ${t('session.cursorBlink')}`}
                            </div>
                          </div>
                          {/* 样式 */}
                          <div className="p-3 rounded-lg" style={{ backgroundColor: theme.ui.surface2 }}>
                            <div className="text-xs font-medium mb-1" style={{ color: theme.ui.textMuted }}>{t('session.styleSettings')}</div>
                            <div className="text-sm" style={{ color: theme.ui.textPrimary }}>
                              {selectedTemplate.lineHeight} · {selectedTemplate.letterSpacing}px
                            </div>
                          </div>
                          {/* 背景 */}
                          <div className="p-3 rounded-lg" style={{ backgroundColor: theme.ui.surface2 }}>
                            <div className="text-xs font-medium mb-1" style={{ color: theme.ui.textMuted }}>{t('session.backgroundSettings')}</div>
                            <div className="text-sm" style={{ color: theme.ui.textPrimary }}>
                              {selectedTemplate.backgroundImage ? selectedTemplate.backgroundImage : t('background.noImage')}
                              {selectedTemplate.backgroundImage && ` · ${selectedTemplate.backgroundOpacity}%`}
                            </div>
                          </div>
                          {/* 缓冲区 */}
                          <div className="p-3 rounded-lg" style={{ backgroundColor: theme.ui.surface2 }}>
                            <div className="text-xs font-medium mb-1" style={{ color: theme.ui.textMuted }}>{t('session.scrollbackSettings')}</div>
                            <div className="text-sm" style={{ color: theme.ui.textPrimary }}>
                              {selectedTemplate.scrollback} {t('session.scrollbackLines')}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full" style={{ color: theme.ui.textMuted }}>
                      <Palette size={48} className="mb-3 opacity-30" />
                      <span className="text-sm">{t('templates.selectTemplate')}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 数据管理 */}
          {activeTab === 'data' && (
            <div className="flex-1 overflow-y-auto p-6">
              <h3 className="text-sm font-medium mb-4" style={{ color: theme.ui.textSecondary }}>
                {t('data.title')}
              </h3>

              <div className="space-y-3">
                <div
                  className="p-4 rounded-xl"
                  style={{ backgroundColor: theme.ui.surface1 }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg" style={{ backgroundColor: theme.ui.surface2 }}>
                        <Download size={18} style={{ color: theme.ui.accent }} />
                      </div>
                      <div>
                        <div className="font-medium" style={{ color: theme.ui.textPrimary }}>{t('data.export')}</div>
                        <div className="text-xs mt-0.5" style={{ color: theme.ui.textMuted }}>
                          {t('data.exportDesc')}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowExportDialog(true)}
                      className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                      style={{ backgroundColor: theme.ui.accent, color: theme.ui.surface0 }}
                    >
                      {t('common.export')}
                    </button>
                  </div>
                </div>

                <div
                  className="p-4 rounded-xl"
                  style={{ backgroundColor: theme.ui.surface1 }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg" style={{ backgroundColor: theme.ui.surface2 }}>
                        <Upload size={18} style={{ color: theme.ui.accent }} />
                      </div>
                      <div>
                        <div className="font-medium" style={{ color: theme.ui.textPrimary }}>{t('data.import')}</div>
                        <div className="text-xs mt-0.5" style={{ color: theme.ui.textMuted }}>
                          {t('data.importDesc')}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={handleImport}
                      className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                      style={{ backgroundColor: theme.ui.surface2, color: theme.ui.textPrimary }}
                    >
                      {t('common.import')}
                    </button>
                  </div>
                </div>

                {/* 会话日志 */}
                <div
                  className="p-4 rounded-xl"
                  style={{ backgroundColor: theme.ui.surface1 }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg" style={{ backgroundColor: theme.ui.surface2 }}>
                        <FileText size={18} style={{ color: theme.ui.accent }} />
                      </div>
                      <div>
                        <div className="font-medium" style={{ color: theme.ui.textPrimary }}>{t('logs.title')}</div>
                        <div className="text-xs mt-0.5" style={{ color: theme.ui.textMuted }}>
                          {t('logs.openLogViewer')}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowLogs(true)}
                      className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                      style={{ backgroundColor: theme.ui.surface2, color: theme.ui.textPrimary }}
                    >
                      {t('logs.openLogViewer')}
                    </button>
                  </div>
                </div>
              </div>

              <div
                className="mt-6 p-4 rounded-xl text-sm"
                style={{ backgroundColor: theme.ui.surface1, color: theme.ui.textMuted }}
              >
                💡 {t('data.tip')}
              </div>
            </div>
          )}

          {/* 关于 */}
          {activeTab === 'about' && <AboutSettings />}
        </div>

        {/* 右侧宽度缩放手柄 */}
        <div
          className="absolute right-0 top-0 bottom-0 w-4 cursor-ew-resize hover:bg-accent/20 transition-colors flex items-center justify-center group"
          onMouseDown={handleWidthResizeStart}
          style={{
            backgroundColor: isResizingWidth ? theme.ui.accent + '30' : 'transparent',
          }}
        >
          <div
            className="w-1 h-12 rounded-full group-hover:opacity-100 transition-opacity"
            style={{ backgroundColor: theme.ui.textMuted, opacity: isResizingWidth ? 1 : 0.5 }}
          />
        </div>
      </div>

      {/* 导出选项对话框 */}
      {showExportDialog && (
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="rounded-lg shadow-xl p-6 w-[400px]"
            style={{ backgroundColor: theme.ui.surface1 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <Shield size={24} style={{ color: theme.ui.accent }} />
              <h3 className="text-lg font-medium" style={{ color: theme.ui.textPrimary }}>
                {t('data.exportOptions')}
              </h3>
            </div>

            <p className="text-sm mb-4" style={{ color: theme.ui.textSecondary }}>
              {t('data.exportOptionsDesc')}
            </p>

            <div className="space-y-3 mb-6">
              <button
                onClick={() => handleExport(false)}
                className="w-full p-4 rounded-lg text-left transition-colors"
                style={{
                  backgroundColor: theme.ui.surface2,
                  border: `1px solid ${theme.ui.border}`,
                }}
              >
                <div className="font-medium" style={{ color: theme.ui.textPrimary }}>
                  {t('data.exportWithoutPassword')}
                </div>
                <div className="text-xs mt-1" style={{ color: theme.ui.textMuted }}>
                  {t('data.exportWithoutPasswordDesc')}
                </div>
              </button>

              <button
                onClick={() => handleExport(true)}
                className="w-full p-4 rounded-lg text-left transition-colors"
                style={{
                  backgroundColor: theme.ui.surface2,
                  border: `1px solid ${theme.ui.border}`,
                }}
              >
                <div className="font-medium flex items-center gap-2" style={{ color: theme.ui.warning }}>
                  <AlertCircle size={16} />
                  {t('data.exportWithPassword')}
                </div>
                <div className="text-xs mt-1" style={{ color: theme.ui.textMuted }}>
                  {t('data.exportWithPasswordDesc')}
                </div>
              </button>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setShowExportDialog(false)}
                className="px-4 py-2 rounded-lg text-sm"
                style={{
                  backgroundColor: theme.ui.surface2,
                  color: theme.ui.textPrimary,
                }}
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 导入预览对话框 */}
      {showImportDialog && importPreview && (
        <ImportDialog
          preview={importPreview}
          onConfirm={handleImportConfirm}
          onClose={() => {
            setShowImportDialog(false)
            setImportPreview(null)
            setImportData('')
          }}
        />
      )}

      {/* 日志查看器 */}
      {showLogs && <LogViewer onClose={() => setShowLogs(false)} />}

      {/* 批量应用模板对话框 */}
      {showApplyDialog && selectedTemplate && (
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="rounded-xl shadow-xl w-[500px] max-h-[80vh] overflow-hidden"
            style={{ backgroundColor: theme.ui.surface1 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 标题 */}
            <div className="px-4 py-3 flex items-center gap-3" style={{ backgroundColor: theme.ui.surface2, borderBottom: `1px solid ${theme.ui.border}` }}>
              <FileCheck size={20} style={{ color: theme.ui.accent }} />
              <h3 className="text-sm font-medium" style={{ color: theme.ui.textPrimary }}>
                {t('templates.applyTitle').replace('{name}', selectedTemplate.name)}
              </h3>
            </div>

            {/* 分组会话列表 */}
            <ApplySessionList
              selectedTemplate={selectedTemplate}
              selectedSessions={selectedSessions}
              setSelectedSessions={setSelectedSessions}
              expandedGroups={expandedApplyGroups}
              setExpandedGroups={setExpandedApplyGroups}
              theme={theme}
            />

            {/* 底部统计和操作 */}
            <div className="px-4 py-3 flex items-center justify-between" style={{ backgroundColor: theme.ui.surface2, borderTop: `1px solid ${theme.ui.border}` }}>
              <span className="text-sm" style={{ color: theme.ui.textMuted }}>
                {t('templates.sessionsSelected')}: {selectedSessions.size}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setShowApplyDialog(false)
                    setSelectedSessions(new Set())
                  }}
                  className="px-4 py-2 rounded-lg text-sm transition-colors"
                  style={{ backgroundColor: theme.ui.surface2, color: theme.ui.textPrimary }}
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={async () => {
                    if (selectedSessions.size === 0) return
                    try {
                      await api.applyTemplateToSessions(selectedTemplate.id, Array.from(selectedSessions))
                      // 刷新会话列表
                      await useSessionStore.getState().loadSessions()
                      setShowApplyDialog(false)
                      setSelectedSessions(new Set())
                    } catch (e) {
                      console.error('Failed to apply template:', e)
                      alert('Failed to apply template: ' + e)
                    }
                  }}
                  disabled={selectedSessions.size === 0}
                  className="px-4 py-2 rounded-lg text-sm transition-colors"
                  style={{
                    backgroundColor: selectedSessions.size > 0 ? theme.ui.accent : theme.ui.surface3,
                    color: selectedSessions.size > 0 ? '#fff' : theme.ui.textMuted,
                    opacity: selectedSessions.size === 0 ? 0.7 : 1,
                  }}
                >
                  {t('templates.apply')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
