import { useState, useEffect, useRef, useCallback } from 'react'
import { Settings, X, Palette, MousePointer2, Clipboard, Download, Upload, Monitor, Check, Type, ChevronDown, Keyboard, Globe, Columns, Rows, Info, Search, FileText, Shield, AlertCircle, Image, GripHorizontal, Zap, Maximize2 } from 'lucide-react'
import { useSettingsStore, formatShortcut } from '../stores/settingsStore'
import { useSessionStore } from '../stores/sessionStore'
import { useLocale } from '../stores/localeStore'
import { appThemes, AppTheme } from './themes'
import { terminalFonts, uiFonts } from '../stores/settingsStore'
import { getAppInfo, AUTHOR_INFO, AI_INFO, AppInfo } from '../version'
import { LogViewer } from './LogViewer'
import { ImportDialog } from './ImportDialog'
import { BackgroundSettingsPanel } from './BackgroundSettingsPanel'
import { api } from '../api/wails'

interface Props {
  onClose: () => void
}

type TabId = 'terminal' | 'theme' | 'background' | 'shortcuts' | 'data' | 'about'

// 快捷键配置项
const shortcutConfigs = [
  { key: 'openSettings', icon: Settings },
  { key: 'newTab', icon: Monitor },
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
      if (key !== 'Meta' && key !== 'Control' && key !== 'Shift' && key !== 'Alt') {
        // 单个字符统一大写，特殊键保持原样（如 Tab, Enter）
        parts.push(key.length === 1 ? key.toUpperCase() : key)
      }

      // 至少需要一个修饰键和一个普通键
      if (parts.length >= 2) {
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
  const { terminalSettings, setTerminalSettings, shortcutSettings, setShortcutSettings, currentTheme, setTheme, getTheme } = useSettingsStore()
  const { exportConfigWithOptions, previewImport, importConfigWithOptions } = useSessionStore()
  const { language, setLanguage, t } = useLocale()
  const [activeTab, setActiveTab] = useState<TabId>('terminal')
  const [previewTheme, setPreviewTheme] = useState<AppTheme | null>(null)
  const [showTerminalFontDropdown, setShowTerminalFontDropdown] = useState(false)
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

  // 拖动相关状态
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 })

  // 拖动开始
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    setIsDragging(true)
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
      setPosition({
        x: dragStartRef.current.posX + dx,
        y: dragStartRef.current.posY + dy,
      })
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging])

  // 获取应用信息
  useEffect(() => {
    getAppInfo().then(setAppInfo)
  }, [])

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
    { id: 'shortcuts' as TabId, label: t('settings.shortcuts'), icon: Keyboard },
    { id: 'data' as TabId, label: t('settings.data'), icon: Download },
    { id: 'about' as TabId, label: t('settings.about'), icon: Info },
  ]

  const displayTheme = previewTheme || appThemes.find(t => t.id === currentTheme) || appThemes[0]

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div
        ref={panelRef}
        className="rounded-2xl w-[800px] max-h-[85vh] overflow-hidden shadow-2xl flex"
        style={{
          backgroundColor: theme.ui.surface0,
          transform: `translate(${position.x}px, ${position.y}px)`,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* 左侧导航 */}
        <div
          className="w-48 p-4 flex flex-col"
          style={{
            backgroundColor: theme.ui.surface1,
            borderRight: `1px solid ${theme.ui.border}`
          }}
        >
          {/* 拖动手柄 */}
          <div
            className="flex items-center gap-2 mb-6 cursor-move select-none"
            style={{ color: theme.ui.textMuted }}
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
                  {appThemes.map(t => {
                    const isSelected = currentTheme === t.id
                    return (
                      <div
                        key={t.id}
                        className={`p-3 rounded-xl cursor-pointer transition-all duration-150 border-2 ${isSelected ? 'ring-2 ring-offset-2' : ''}`}
                        style={{
                          backgroundColor: t.ui.surface1,
                          borderColor: isSelected ? t.ui.accent : t.ui.border,
                          '--tw-ring-color': t.ui.accent,
                          '--tw-ring-offset-color': theme.ui.surface0,
                        } as React.CSSProperties}
                        onClick={() => setTheme(t.id)}
                        onMouseEnter={() => setPreviewTheme(t)}
                        onMouseLeave={() => setPreviewTheme(null)}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium" style={{ color: t.ui.textPrimary }}>{t.name}</span>
                          {isSelected && <Check size={14} style={{ color: t.ui.accent }} />}
                        </div>
                        <div className="flex gap-1">
                          {[t.terminal.background, t.terminal.red, t.terminal.green, t.terminal.yellow, t.terminal.blue, t.terminal.magenta].map((color, idx) => (
                            <div key={idx} className="w-4 h-4 rounded" style={{ backgroundColor: color }} />
                          ))}
                        </div>
                      </div>
                    )
                  })}
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
          {activeTab === 'about' && (
            <div className="flex-1 overflow-y-auto p-6">
              <h3 className="text-sm font-medium mb-4" style={{ color: theme.ui.textSecondary }}>
                {t('about.title')}
              </h3>

              {/* 应用信息 */}
              <div className="space-y-4">
                <div
                  className="p-6 rounded-xl text-center"
                  style={{ backgroundColor: theme.ui.surface1 }}
                >
                  <div className="text-3xl font-bold mb-2" style={{ color: theme.ui.accent }}>
                    {appInfo?.name || 'Crayon'}
                  </div>
                  <div className="text-lg" style={{ color: theme.ui.textPrimary }}>
                    {appInfo?.version || '-'}
                  </div>
                  <div className="text-sm mt-2" style={{ color: theme.ui.textMuted }}>
                    {t('about.subtitle')}
                  </div>
                </div>

                {/* 构建信息 */}
                <div
                  className="p-4 rounded-xl"
                  style={{ backgroundColor: theme.ui.surface1 }}
                >
                  <h4 className="font-medium mb-3" style={{ color: theme.ui.textPrimary }}>
                    {t('about.buildInfo')}
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span style={{ color: theme.ui.textMuted }}>{t('about.version')}</span>
                      <span style={{ color: theme.ui.textPrimary }}>{appInfo?.version || '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: theme.ui.textMuted }}>{t('about.buildDate')}</span>
                      <span style={{ color: theme.ui.textPrimary }}>{appInfo?.buildTime || '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: theme.ui.textMuted }}>{t('about.platform')}</span>
                      <span style={{ color: theme.ui.textPrimary }}>{appInfo?.platform || '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: theme.ui.textMuted }}>{t('about.goVersion')}</span>
                      <span style={{ color: theme.ui.textPrimary }}>{appInfo?.goVersion || '-'}</span>
                    </div>
                    {appInfo?.gitCommit && (
                      <div className="flex justify-between">
                        <span style={{ color: theme.ui.textMuted }}>Git Commit</span>
                        <span style={{ color: theme.ui.textPrimary }} className="font-mono text-xs">{appInfo.gitCommit.substring(0, 8)}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* 作者信息 */}
                <div
                  className="p-4 rounded-xl"
                  style={{ backgroundColor: theme.ui.surface1 }}
                >
                  <h4 className="font-medium mb-3" style={{ color: theme.ui.textPrimary }}>
                    {t('about.author')}
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span style={{ color: theme.ui.textMuted }}>{t('about.authorName')}</span>
                      <span style={{ color: theme.ui.textPrimary }}>{appInfo?.author || AUTHOR_INFO.name}</span>
                    </div>
                    {AUTHOR_INFO.github && (
                      <div className="flex justify-between items-center">
                        <span style={{ color: theme.ui.textMuted }}>GitHub</span>
                        <a
                          href={AUTHOR_INFO.github}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline"
                          style={{ color: theme.ui.accent }}
                        >
                          {AUTHOR_INFO.github}
                        </a>
                      </div>
                    )}
                  </div>
                </div>

                {/* AI 信息 */}
                <div
                  className="p-4 rounded-xl"
                  style={{ backgroundColor: theme.ui.surface1 }}
                >
                  <h4 className="font-medium mb-3" style={{ color: theme.ui.textPrimary }}>
                    {t('about.aiInfo')}
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span style={{ color: theme.ui.textMuted }}>{t('about.aiModel')}</span>
                      <span style={{ color: theme.ui.textPrimary }}>{AI_INFO.model}</span>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: theme.ui.textMuted }}>{t('about.aiCodingAgent')}</span>
                      <span style={{ color: theme.ui.textPrimary }}>{AI_INFO.codingAgent}</span>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: theme.ui.textMuted }}>{t('about.aiProvider')}</span>
                      <a
                        href={AI_INFO.modelProvider}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                        style={{ color: theme.ui.accent }}
                      >
                        {AI_INFO.modelProvider}
                      </a>
                    </div>
                  </div>
                </div>

                {/* 致谢 */}
                <div
                  className="p-4 rounded-xl text-sm"
                  style={{ backgroundColor: theme.ui.surface1, color: theme.ui.textMuted }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span style={{ color: theme.ui.accent }}>✨</span>
                    <span style={{ color: theme.ui.textPrimary }}>{t('about.acknowledgements')}</span>
                  </div>
                  <p>{t('about.acknowledgementsText')}</p>
                </div>
              </div>
            </div>
          )}
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
    </div>
  )
}