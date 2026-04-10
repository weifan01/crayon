import { useState, useEffect, useRef, useCallback } from 'react'
import { Sidebar } from './components/Sidebar'
import { TabBar } from './components/TabBar'
import { SplitPaneLayout } from './components/SplitPaneLayout'
import { StatusBar } from './components/StatusBar'
import { SettingsPanel } from './components/SettingsPanel'
import { SplashScreen } from './components/SplashScreen'
import { QuickConnect } from './components/QuickConnect'
import { useSessionStore } from './stores/sessionStore'
import { useTerminalStore, SplitDirection } from './stores/terminalStore'
import { useSettingsStore } from './stores/settingsStore'
import { useLocale } from './stores/localeStore'
import { api } from './api/wails'
import { Zap } from 'lucide-react'
import { APP_NAME } from './version'

function App() {
  const [showSplash, setShowSplash] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  const [showQuickConnect, setShowQuickConnect] = useState(false)
  const { sessions } = useSessionStore()
  const { tabs, activeTabId, createTab, setActiveTab, setActivePane, getTab, splitPane, closePane } = useTerminalStore()
  const { shortcutSettings } = useSettingsStore()
  const { t } = useLocale()
  const renderedTabsRef = useRef<Set<string>>(new Set())

  useEffect(() => { useSessionStore.getState().loadSessions() }, [])

  // 添加快速连接键盘快捷键 (Cmd+K 或 Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        e.stopPropagation()
        setShowQuickConnect(true)
      }
    }
    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [])

  // Cmd+, (Mac) 或 Ctrl+, (Windows) 打开设置
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 检查是否匹配打开设置的快捷键
      const shortcut = shortcutSettings.openSettings
      const isMeta = shortcut.includes('Meta')
      const isCtrl = shortcut.includes('Ctrl')
      const key = shortcut.split('+').pop() || ''

      const metaPressed = e.metaKey || e.ctrlKey
      const keyMatch = e.key === key || e.key === key.toLowerCase()

      if ((isMeta || isCtrl) && metaPressed && keyMatch) {
        e.preventDefault()
        e.stopPropagation()
        setShowSettings(true)
      }
    }
    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [shortcutSettings.openSettings])

  // Ctrl+Tab 切换标签页
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Tab 或 Cmd+Tab (macOS)
      if ((e.ctrlKey || e.metaKey) && e.key === 'Tab') {
        e.preventDefault()
        e.stopPropagation()
        if (tabs.length > 1) {
          const currentIndex = tabs.findIndex(t => t.id === activeTabId)
          // 支持 Ctrl+Shift+Tab 反向切换
          const direction = e.shiftKey ? -1 : 1
          const nextIndex = (currentIndex + direction + tabs.length) % tabs.length
          setActiveTab(tabs[nextIndex].id)
        }
      }
    }
    // 使用 capture: true 在捕获阶段处理，确保在终端之前拦截
    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [tabs, activeTabId, setActiveTab])

  // 分屏快捷键 (iTerm2 风格)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 从设置中获取快捷键配置
      const shortcuts = shortcutSettings

      // 解析快捷键字符串
      const parseShortcut = (shortcut: string) => {
        const parts = shortcut.split('+')
        const key = parts[parts.length - 1]
        const needsShift = parts.includes('Shift')
        const needsMeta = parts.includes('Meta')
        const needsCtrl = parts.includes('Control')
        const needsAlt = parts.includes('Alt')
        return { key, needsShift, needsMeta, needsCtrl, needsAlt }
      }

      // 检查快捷键匹配
      const matchShortcut = (shortcutStr: string) => {
        const { key, needsShift, needsMeta, needsCtrl, needsAlt } = parseShortcut(shortcutStr)
        // e.key 可能是大写或小写，统一比较
        const keyMatch = e.key.toLowerCase() === key.toLowerCase()

        // 检查修饰键
        // 对于 Mac，Meta 是 Cmd；对于 Windows/Linux，Control 是 Ctrl
        const metaMatch = needsMeta ? e.metaKey : true
        const ctrlMatch = needsCtrl ? e.ctrlKey : true
        const altMatch = needsAlt ? e.altKey : true

        // 对于需要 Shift 的按键（如 Tab），必须按下 Shift
        // 对于大写字母（如 W），按键本身需要 Shift 来输入，但我们不额外要求 Shift
        // 这样 Meta+W（关闭标签页）和 Meta+Shift+W（关闭分屏）可以正确区分
        const isUppercaseLetter = key.length === 1 && key >= 'A' && key <= 'Z'
        const shiftMatch = isUppercaseLetter
          ? (needsShift ? e.shiftKey : !e.shiftKey)
          : (needsShift ? e.shiftKey : true)

        return keyMatch && shiftMatch && metaMatch && ctrlMatch && altMatch
      }

      // 垂直分屏（左右）- Cmd+D 或 Ctrl+D
      if (matchShortcut(shortcuts.splitVertical)) {
        e.preventDefault()
        e.stopPropagation()
        if (activeTabId) {
          const tab = getTab(activeTabId)
          if (tab) {
            splitPane(activeTabId, tab.activePaneId, 'horizontal' as SplitDirection)
          }
        }
      }

      // 水平分屏（上下）- Cmd+Shift+D 或 Ctrl+Shift+D
      if (matchShortcut(shortcuts.splitHorizontal)) {
        e.preventDefault()
        e.stopPropagation()
        if (activeTabId) {
          const tab = getTab(activeTabId)
          if (tab) {
            splitPane(activeTabId, tab.activePaneId, 'vertical' as SplitDirection)
          }
        }
      }

      // 关闭当前分屏 - Cmd+Shift+W 或 Ctrl+Shift+W
      if (matchShortcut(shortcuts.closePane)) {
        e.preventDefault()
        e.stopPropagation()
        if (activeTabId) {
          const tab = getTab(activeTabId)
          if (tab) {
            closePane(activeTabId, tab.activePaneId)
          }
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [activeTabId, getTab, splitPane, closePane, shortcutSettings])

  // Cmd+Enter (Mac) 或 Ctrl+Enter (Windows) 切换全屏
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        await api.windowToggleFullscreen()
        // 全屏切换后延迟触发窗口 resize 事件
        const delays = [50, 100, 200, 400, 600]
        delays.forEach(delay => {
          setTimeout(() => window.dispatchEvent(new Event('resize')), delay)
        })
      }
    }
    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [])

  useEffect(() => {
    const currentTabIds = new Set(tabs.map(t => t.id))
    const rendered = renderedTabsRef.current
    rendered.forEach(id => {
      if (!currentTabIds.has(id)) {
        rendered.delete(id)
      }
    })
  }, [tabs])

  const handleSelect = async (id: string, forceNew = false) => {
    if (!forceNew) {
      const existingTab = tabs.find(t => {
        // 检查第一个 pane 的 sessionId
        const firstPane = t.rootPane.type === 'pane' ? t.rootPane : t.rootPane.children[0]
        return firstPane.type === 'pane' && firstPane.sessionId === id
      })
      if (existingTab) {
        setActiveTab(existingTab.id)
        return
      }
    }

    const s = sessions.find((x: any) => x.id === id)
    const newTabId = createTab(id, s?.name || id, forceNew)
    renderedTabsRef.current.add(newTabId)
  }

  const handleDoubleClick = async (id: string) => {
    await handleSelect(id, true)
  }

  const handleQuickConnect = async (id: string) => {
    const s = sessions.find((s: any) => s.id === id)
    const newTabId = createTab(id, s?.name || id)
    renderedTabsRef.current.add(newTabId)
  }

  const handleCloneTab = (sessionId: string) => {
    const session = sessions.find((s: any) => s.id === sessionId)
    const newTabId = createTab(sessionId, session?.name || sessionId, true)
    renderedTabsRef.current.add(newTabId)
  }

  const handlePaneClick = useCallback((tabId: string, paneId: string) => {
    setActiveTab(tabId)
    setActivePane(tabId, paneId)
  }, [setActiveTab, setActivePane])

  // 使用 ref 缓存每个 tab 的 onPaneClick 回调，确保引用稳定
  const paneClickHandlersRef = useRef<Map<string, (paneId: string) => void>>(new Map())
  const getPaneClickHandler = useCallback((tabId: string) => {
    if (!paneClickHandlersRef.current.has(tabId)) {
      paneClickHandlersRef.current.set(tabId, (paneId: string) => handlePaneClick(tabId, paneId))
    }
    return paneClickHandlersRef.current.get(tabId)!
  }, [handlePaneClick])

  const tabsToRender = tabs.filter(t =>
    t.id === activeTabId || renderedTabsRef.current.has(t.id)
  )

  return (
    <div className="flex flex-col h-screen bg-surface-0 text-text-primary">
      {/* 启动动画 */}
      {showSplash && <SplashScreen onFinish={() => setShowSplash(false)} />}

      {/* 主内容区 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 侧边栏 */}
        <Sidebar
          onSelectSession={handleSelect}
          onDoubleClickSession={handleDoubleClick}
          onOpenSettings={() => setShowSettings(true)}
          onQuickConnect={handleQuickConnect}
        />

        {/* 主区域 */}
        <div className="flex flex-col flex-1 overflow-hidden bg-surface-1">
          {/* 标签栏 */}
          <TabBar onCloneTab={handleCloneTab} />

          {/* 终端区域 */}
          <div className="flex-1 overflow-hidden relative">
            {tabs.length === 0 ? (
              <div className="flex items-center justify-center h-full text-text-muted">
                <div className="text-center">
                  <div
                    className="w-24 h-24 mx-auto mb-8 rounded-2xl flex items-center justify-center cursor-pointer transition-all duration-300 hover:scale-110 hover:shadow-lg"
                    style={{ backgroundColor: 'var(--surface-2)' }}
                    onClick={() => setShowQuickConnect(true)}
                    title={t('welcome.clickToConnect')}
                  >
                    <Zap size={40} style={{ color: 'var(--accent)' }} />
                  </div>
                  <p className="text-2xl mb-3 text-text-secondary font-semibold">{APP_NAME}</p>
                  <p
                    className="text-sm text-accent cursor-pointer hover:underline transition-colors"
                    onClick={() => setShowQuickConnect(true)}
                  >
                    {t('welcome.clickToConnect')}
                  </p>
                </div>
              </div>
            ) : (
              tabsToRender.map(tab => (
                <div
                  key={tab.id}
                  className="absolute inset-0"
                  style={{
                    visibility: tab.id === activeTabId ? 'visible' : 'hidden',
                    zIndex: tab.id === activeTabId ? 1 : 0
                  }}
                >
                  <SplitPaneLayout
                    tabId={tab.id}
                    node={tab.rootPane}
                    isActiveTab={tab.id === activeTabId}
                    activePaneId={tab.activePaneId}
                    onPaneClick={getPaneClickHandler(tab.id)}
                  />
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 状态栏 */}
      <StatusBar />

      {/* 弹窗 */}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}

      {/* 快速连接对话框 */}
      {showQuickConnect && (
        <QuickConnect
          onClose={() => setShowQuickConnect(false)}
          onConnect={(id) => {
            setShowQuickConnect(false);
            handleQuickConnect(id);
          }}
        />
      )}
    </div>
  )
}

export default App