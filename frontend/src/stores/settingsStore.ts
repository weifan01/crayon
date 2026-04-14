import { create } from 'zustand'
import { appThemes, AppTheme, themeToCssVariables, toTerminalTheme, TerminalTheme } from '../components/themes'
import { api, BackgroundSettings } from '../api/wails'
import { getImageMimeType } from '../utils/paneUtils'

interface TerminalSettings {
  copyOnSelect: boolean      // 选中即复制
  pasteOnRightClick: boolean // 右键粘贴
  fontFamily: string         // 终端字体
  fontSize: number           // 终端字体大小
  uiFontFamily: string       // 界面字体
  searchBarPosition: 'top' | 'bottom' // 搜索框位置
}

// 快捷键配置
interface ShortcutSettings {
  openSettings: string       // 打开设置
  newTab: string            // 新建标签页
  closeTab: string          // 关闭标签页
  nextTab: string           // 下一个标签页
  prevTab: string           // 上一个标签页
  splitVertical: string     // 垂直分屏（左右）
  splitHorizontal: string   // 水平分屏（上下）
  closePane: string         // 关闭当前分屏
  quickConnect: string      // 快速连接
  toggleFullscreen: string  // 切换全屏
}

// 默认背景设置
const defaultBackgroundSettings: BackgroundSettings = {
  enabled: false,
  storageType: 'file',
  opacity: 0.3,
  blur: 0,
  fitMode: 'cover',
  position: 'center',
  scope: 'app',
}

interface SettingsState {
  currentTheme: string
  terminalSettings: TerminalSettings
  shortcutSettings: ShortcutSettings
  backgroundSettings: BackgroundSettings
  themes: AppTheme[]  // 新增：所有可用主题列表
  getTheme: () => AppTheme
  getThemeById: (themeId: string) => AppTheme | undefined  // 新增：按 ID 获取主题
  getTerminalTheme: () => TerminalTheme
  getTerminalThemeById: (themeId: string) => TerminalTheme | undefined  // 新增：按 ID 获取终端主题
  setTheme: (themeId: string) => void
  setTerminalSettings: (settings: Partial<TerminalSettings>) => void
  setShortcutSettings: (settings: Partial<ShortcutSettings>) => void
  setBackgroundSettings: (settings: Partial<BackgroundSettings>) => void
  applyBackground: () => Promise<void>
  resetBackground: () => void
  applyTheme: () => void
  applyUIFont: () => void
}

// 默认快捷键（iTerm2 风格）
const defaultShortcuts: ShortcutSettings = {
  openSettings: 'Meta+,',      // Mac: Cmd+,, Windows: Ctrl+,
  newTab: 'Meta+T',           // Mac: Cmd+T, Windows: Ctrl+T
  closeTab: 'Meta+W',         // Mac: Cmd+W, Windows: Ctrl+W
  nextTab: 'Control+Tab',     // Ctrl+Tab 切换到下一个
  prevTab: 'Control+Shift+Tab', // Ctrl+Shift+Tab 切换到上一个
  splitVertical: 'Meta+D',        // Mac: Cmd+D 垂直分屏（左右）
  splitHorizontal: 'Meta+Shift+D', // Mac: Cmd+Shift+D 水平分屏（上下）
  closePane: 'Meta+Shift+W',     // Mac: Cmd+Shift+W 关闭当前分屏
  quickConnect: 'Meta+K',        // Mac: Cmd+K 快速连接
  toggleFullscreen: 'Meta+Enter', // Mac: Cmd+Enter 切换全屏
}

// 格式化快捷键显示
export function formatShortcut(shortcut: string): string {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
  return shortcut
    .replace('Meta', isMac ? '⌘' : 'Ctrl')
    .replace('Shift', isMac ? '⇧' : 'Shift')
    .replace('Alt', isMac ? '⌥' : 'Alt')
    .replace('Control', isMac ? '⌃' : 'Ctrl')
    .replace(/\+/g, isMac ? '' : '+')
}

// 默认字体列表（第一项为系统默认）
export const terminalFonts = [
  { value: 'Menlo, Monaco, "Courier New", monospace', label: '系统默认' },
  { value: 'Monaco, Menlo, "Courier New", monospace', label: 'Monaco' },
  { value: '"Fira Code", Monaco, Menlo, monospace', label: 'Fira Code' },
  { value: '"JetBrains Mono", Monaco, Menlo, monospace', label: 'JetBrains Mono' },
  { value: '"Source Code Pro", Monaco, Menlo, monospace', label: 'Source Code Pro' },
  { value: 'Consolas, Monaco, Menlo, monospace', label: 'Consolas' },
  { value: '"Courier New", Monaco, Menlo, monospace', label: 'Courier New' },
]

export const uiFonts = [
  { value: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif', label: '系统默认' },
  { value: '"PingFang SC", "Microsoft YaHei", sans-serif', label: '苹方/微软雅黑' },
  { value: '"Helvetica Neue", Arial, sans-serif', label: 'Helvetica' },
  { value: '"Segoe UI", Roboto, sans-serif', label: 'Segoe UI' },
]

// 默认终端设置
const defaultTerminalSettings: TerminalSettings = {
  copyOnSelect: true,
  pasteOnRightClick: true,
  fontFamily: terminalFonts[0].value,  // 系统默认
  fontSize: 14,
  uiFontFamily: uiFonts[0].value,      // 系统默认
  searchBarPosition: 'top',             // 搜索框位置默认在顶部
}

// 加载终端设置
const loadTerminalSettings = (): TerminalSettings => {
  try {
    const saved = localStorage.getItem('terminal-settings')
    if (saved) {
      const parsed = JSON.parse(saved)
      // 合并默认值，确保新字段有默认值
      return { ...defaultTerminalSettings, ...parsed }
    }
  } catch (e) {
    console.error('Failed to load terminal settings:', e)
  }
  return defaultTerminalSettings
}

const saveTerminalSettings = (settings: TerminalSettings) => {
  try {
    localStorage.setItem('terminal-settings', JSON.stringify(settings))
  } catch (e) {
    console.error('Failed to save terminal settings:', e)
  }
}

// 加载快捷键设置
const loadShortcutSettings = (): ShortcutSettings => {
  try {
    const saved = localStorage.getItem('shortcut-settings')
    if (saved) {
      return { ...defaultShortcuts, ...JSON.parse(saved) }
    }
  } catch (e) {
    console.error('Failed to load shortcut settings:', e)
  }
  return defaultShortcuts
}

const saveShortcutSettings = (settings: ShortcutSettings) => {
  try {
    localStorage.setItem('shortcut-settings', JSON.stringify(settings))
  } catch (e) {
    console.error('Failed to save shortcut settings:', e)
  }
}

// 加载背景设置
const loadBackgroundSettings = (): BackgroundSettings => {
  try {
    const saved = localStorage.getItem('background-settings')
    if (saved) {
      return { ...defaultBackgroundSettings, ...JSON.parse(saved) }
    }
  } catch (e) {
    console.error('Failed to load background settings:', e)
  }
  return defaultBackgroundSettings
}

// 保存背景设置
const saveBackgroundSettings = (settings: BackgroundSettings) => {
  try {
    localStorage.setItem('background-settings', JSON.stringify(settings))
  } catch (e) {
    console.error('Failed to save background settings:', e)
  }
}

// 应用背景 CSS
const applyBackgroundCss = async (settings: BackgroundSettings) => {
  const root = document.documentElement

  if (!settings.enabled) {
    root.removeAttribute('data-custom-bg')
    root.style.removeProperty('--custom-bg-image')
    root.style.removeProperty('--custom-bg-opacity')
    root.style.removeProperty('--custom-bg-blur')
    root.style.removeProperty('--custom-bg-fit')
    root.style.removeProperty('--custom-bg-position')
    root.style.removeProperty('--custom-bg-repeat')
    return
  }

  let imageUrl: string = ''

  if (settings.storageType === 'base64' && settings.imageData) {
    imageUrl = settings.imageData
  } else if (settings.imagePath) {
    try {
      const base64Data = await api.loadBackgroundImage(settings.imagePath)
      // 根据文件扩展名确定 MIME 类型
      const mimeType = getImageMimeType(settings.imagePath)
      imageUrl = `data:${mimeType};base64,${base64Data}`
    } catch (e) {
      console.error('Failed to load background image:', e)
      return
    }
  }

  if (!imageUrl) return

  root.style.setProperty('--custom-bg-image', `url(${imageUrl})`)
  root.style.setProperty('--custom-bg-opacity', String(settings.opacity))
  root.style.setProperty('--custom-bg-blur', `${settings.blur}px`)

  // 填充方式
  const fitValues: Record<string, string> = {
    cover: 'cover',
    contain: 'contain',
    tile: 'auto',
    fill: '100% 100%'
  }
  root.style.setProperty('--custom-bg-fit', fitValues[settings.fitMode])

  // 位置
  const posValues: Record<string, string> = {
    center: 'center center',
    top: 'center top',
    bottom: 'center bottom',
    left: 'left center',
    right: 'right center',
  }
  root.style.setProperty('--custom-bg-position', posValues[settings.position])

  // 平铺重复
  root.style.setProperty('--custom-bg-repeat', settings.fitMode === 'tile' ? 'repeat' : 'no-repeat')

  root.setAttribute('data-custom-bg', settings.scope)
}

// 应用 CSS 变量到文档根元素
const applyCssVariables = (theme: AppTheme) => {
  const variables = themeToCssVariables(theme)
  const root = document.documentElement

  // 设置 CSS 变量
  Object.entries(variables).forEach(([key, value]) => {
    root.style.setProperty(key, value)
  })

  // 设置主题样式类型（用于蜡笔主题等特殊样式）
  if (theme.style) {
    root.setAttribute('data-theme-style', theme.style)
  } else {
    root.removeAttribute('data-theme-style')
  }
}

// 应用界面字体
const applyUIFont = (fontFamily: string) => {
  document.documentElement.style.setProperty('--ui-font-family', fontFamily)
  document.body.style.fontFamily = fontFamily
}

// 初始化时应用保存的主题
const savedThemeId = localStorage.getItem('terminal-theme') || 'starry-night'
const initialTheme = appThemes.find(t => t.id === savedThemeId) || appThemes[0]
const initialSettings = loadTerminalSettings()
const initialShortcuts = loadShortcutSettings()
const initialBackgroundSettings = loadBackgroundSettings()

// 延迟应用，确保 DOM 已加载
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      applyCssVariables(initialTheme)
      applyUIFont(initialSettings.uiFontFamily)
      applyBackgroundCss(initialBackgroundSettings)
    })
  } else {
    applyCssVariables(initialTheme)
    applyUIFont(initialSettings.uiFontFamily)
    applyBackgroundCss(initialBackgroundSettings)
  }
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  currentTheme: savedThemeId,
  terminalSettings: initialSettings,
  shortcutSettings: initialShortcuts,
  backgroundSettings: initialBackgroundSettings,
  themes: appThemes,  // 导出所有主题

  getTheme: () => {
    const themeId = get().currentTheme
    return appThemes.find(t => t.id === themeId) || appThemes[0]
  },

  getThemeById: (themeId: string) => {
    return appThemes.find(t => t.id === themeId)
  },

  getTerminalTheme: () => {
    const themeId = get().currentTheme
    const theme = appThemes.find(t => t.id === themeId) || appThemes[0]
    return toTerminalTheme(theme)
  },

  getTerminalThemeById: (themeId: string) => {
    const theme = appThemes.find(t => t.id === themeId)
    return theme ? toTerminalTheme(theme) : undefined
  },

  setTheme: (themeId: string) => {
    localStorage.setItem('terminal-theme', themeId)
    set({ currentTheme: themeId })
    // 应用主题
    const theme = appThemes.find(t => t.id === themeId) || appThemes[0]
    applyCssVariables(theme)
  },

  setTerminalSettings: (settings: Partial<TerminalSettings>) => {
    const newSettings = { ...get().terminalSettings, ...settings }
    saveTerminalSettings(newSettings)
    set({ terminalSettings: newSettings })
    // 如果字体设置变化，立即应用
    if (settings.uiFontFamily) {
      applyUIFont(settings.uiFontFamily)
    }
  },

  setShortcutSettings: (settings: Partial<ShortcutSettings>) => {
    const newSettings = { ...get().shortcutSettings, ...settings }
    saveShortcutSettings(newSettings)
    set({ shortcutSettings: newSettings })
  },

  setBackgroundSettings: (settings: Partial<BackgroundSettings>) => {
    const newSettings = { ...get().backgroundSettings, ...settings }
    saveBackgroundSettings(newSettings)
    set({ backgroundSettings: newSettings })
  },

  applyBackground: async () => {
    const settings = get().backgroundSettings
    await applyBackgroundCss(settings)
  },

  resetBackground: () => {
    const newSettings = { ...defaultBackgroundSettings }
    saveBackgroundSettings(newSettings)
    set({ backgroundSettings: newSettings })
    applyBackgroundCss(newSettings)
  },

  applyTheme: () => {
    const theme = get().getTheme()
    applyCssVariables(theme)
  },

  applyUIFont: () => {
    applyUIFont(get().terminalSettings.uiFontFamily)
  },
}))