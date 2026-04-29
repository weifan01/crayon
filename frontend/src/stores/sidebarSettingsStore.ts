import { create } from 'zustand'

type SidebarMode = 'always-show' | 'auto-hide'

interface SidebarSettings {
  width: number
  mode: SidebarMode
  bottomMenuMode?: SidebarMode
}

interface SettingsState {
  sidebar: SidebarSettings
  setSidebarWidth: (width: number) => void
  setSidebarMode: (mode: SidebarMode) => void
  setBottomMenuMode: (mode: SidebarMode) => void
}

const STORAGE_KEY = 'crayon-sidebar-settings'

const loadSettings = (): SidebarSettings => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      // 兼容旧设置，将 'normal' 转换为 'always-show'
      if (parsed.mode === 'normal') {
        parsed.mode = 'always-show'
      }
      return parsed
    }
  } catch (e) {
    console.error('Failed to load sidebar settings:', e)
  }
  return { width: 256, mode: 'always-show', bottomMenuMode: 'always-show' }
}

const saveSettings = (settings: SidebarSettings) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch (e) {
    console.error('Failed to save sidebar settings:', e)
  }
}

export const useSidebarSettings = create<SettingsState>((set, get) => ({
  sidebar: loadSettings(),

  setSidebarWidth: (width: number) => {
    const newSettings = { ...get().sidebar, width }
    saveSettings(newSettings)
    set({ sidebar: newSettings })
  },

  setSidebarMode: (mode: SidebarMode) => {
    const newSettings = { ...get().sidebar, mode }
    saveSettings(newSettings)
    set({ sidebar: newSettings })
  },

  setBottomMenuMode: (mode: SidebarMode) => {
    const newSettings = { ...get().sidebar, bottomMenuMode: mode }
    saveSettings(newSettings)
    set({ sidebar: newSettings })
  },
}))