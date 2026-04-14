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

// 统一的快捷键匹配函数 - 简化版
function matchShortcut(e: KeyboardEvent, shortcutStr: string): boolean {
  const parts = shortcutStr.split('+')
  const key = parts[parts.length - 1]

  // 检查需要的修饰键
  const needsMeta = parts.includes('Meta')
  const needsCtrl = parts.includes('Control')
  const needsShift = parts.includes('Shift')
  const needsAlt = parts.includes('Alt')

  // 按键匹配（大小写不敏感）
  if (e.key.toLowerCase() !== key.toLowerCase()) return false

  // Meta 在 Mac 上是 Cmd 键，Windows 上用 Ctrl 键替代
  // 所以 needsMeta 时：Mac 上需要 e.metaKey，Windows 上需要 e.ctrlKey
  // needsCtrl 时：只需要 e.ctrlKey（纯 Ctrl 键）
  if (needsMeta) {
    // Mac: e.metaKey, Windows: e.ctrlKey
    if (!(e.metaKey || e.ctrlKey)) return false
  }

  if (needsCtrl) {
    if (!e.ctrlKey) return false
  }

  // 如果快捷键既不需要 Meta 也不需要 Ctrl，确保都没有按下
  if (!needsMeta && !needsCtrl) {
    if (e.metaKey || e.ctrlKey) return false
  }

  // Shift 检查
  if (needsShift) {
    if (!e.shiftKey) return false
  } else {
    // 不需要 Shift 时，确保没有按下
    if (e.shiftKey) return false
  }

  // Alt 检查
  if (needsAlt) {
    if (!e.altKey) return false
  } else {
    if (e.altKey) return false
  }

  return true
}

// 获取分屏树中所有 pane 的 ID
function getAllPaneIds(node: any): string[] {
  if (node.type === 'pane') return [node.id]
  return [...getAllPaneIds(node.children[0]), ...getAllPaneIds(node.children[1])]
}

function App() {
  const [showSplash, setShowSplash] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  const [showQuickConnect, setShowQuickConnect] = useState(false)
  const { sessions } = useSessionStore()
  const { tabs, activeTabId, createTab, setActiveTab } = useTerminalStore()
  const { t } = useLocale()
  const renderedTabsRef = useRef<Set<string>>(new Set())
  const appRef = useRef<HTMLDivElement>(null)

  useEffect(() => { useSessionStore.getState().loadSessions() }, [])

  // 启动时从后端同步语言设置
  useEffect(() => {
    api.getLanguage().then(lang => {
      if (lang && (lang === 'zh' || lang === 'en')) {
        useLocale.getState().setLanguage(lang)
      }
    }).catch(err => console.error('Failed to get language from backend:', err))
  }, [])

  // 启动后设置焦点，确保键盘事件可以正常捕获
  useEffect(() => {
    // 延迟 focus，等待 splash screen 结束
    const timer = setTimeout(() => {
      if (appRef.current) {
        appRef.current.focus()
        console.log('App container focused')
      }
    }, 100)
    return () => clearTimeout(timer)
  }, [showSplash])

  // 全局快捷键处理 - 使用 ref 保持稳定引用
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // 从 store 获取最新配置和状态
      const shortcutSettings = useSettingsStore.getState().shortcutSettings
      const terminalStore = useTerminalStore.getState()
      const sessionStore = useSessionStore.getState()

      // 获取事件目标元素信息
      const target = e.target as HTMLElement
      const tagName = target.tagName.toLowerCase()

      // ESC 键关闭对话框/面板
      if (e.key === 'Escape') {
        // 检查是否有打开的对话框或面板，按优先级关闭
        if (showSettings) {
          e.preventDefault()
          e.stopPropagation()
          setShowSettings(false)
          return
        }
        if (showQuickConnect) {
          e.preventDefault()
          e.stopPropagation()
          setShowQuickConnect(false)
          return
        }
        // 检查是否有其他对话框（通过 DOM 检查）
        const modalDialog = document.querySelector('.modal-dialog, [role="dialog"]:not(.settings-panel)')
        if (modalDialog) {
          e.preventDefault()
          e.stopPropagation()
          return
        }
      }

      // 检查是否在设置面板的输入框中（通过 class 检查）
      if (target.closest('.settings-panel') && (tagName === 'input' || tagName === 'textarea' || target.closest('[role="textbox"]'))) {
        return
      }

      // 如果设置面板打开，阻止所有快捷键传递到终端
      if (document.querySelector('.settings-panel')) {
        return
      }

      // 忽略在文本输入框中的按键
      if (tagName === 'input') {
        const inputType = (target as HTMLInputElement).type || 'text'
        if (['text', 'password', 'email', 'search', 'url', 'tel', 'number'].includes(inputType)) {
          return
        }
      }

      // textarea 是文本输入，但排除 xterm.js 的 helper textarea（终端使用）
      if (tagName === 'textarea') {
        // xterm.js 使用隐藏的 textarea.xterm-helper-textarea 捕获键盘输入
        if (target.classList.contains('xterm-helper-textarea') || target.closest('.xterm')) {
          // 在终端中，允许快捷键
        } else {
          return
        }
      }

      // 打开设置
      if (matchShortcut(e, shortcutSettings.openSettings)) {
        e.preventDefault()
        e.stopPropagation()
        setShowSettings(true)
        return
      }

      // 新建标签页 - 打开快速连接
      if (matchShortcut(e, shortcutSettings.newTab)) {
        e.preventDefault()
        e.stopPropagation()
        setShowQuickConnect(true)
        return
      }

      // 关闭标签页
      if (matchShortcut(e, shortcutSettings.closeTab)) {
        e.preventDefault()
        e.stopPropagation()
        const tabId = terminalStore.activeTabId
        if (tabId) {
          const tab = terminalStore.getTab(tabId)
          if (tab) {
            const allPaneIds = getAllPaneIds(tab.rootPane)
            const connectedPaneIds = allPaneIds.filter(id => sessionStore.getTabStatus(id) === 'connected')

            if (connectedPaneIds.length > 0) {
              const confirmed = await sessionStore.confirmDialog(t('confirm.closeTab'), t('confirm.closeTabMsg'))
              if (!confirmed) return
              for (const paneId of connectedPaneIds) {
                await sessionStore.disconnectTab(paneId)
                sessionStore.cleanupTab(paneId)
              }
            }
            terminalStore.closeTab(tabId)
          }
        }
        return
      }

      // 切换到下一个标签页
      if (matchShortcut(e, shortcutSettings.nextTab)) {
        e.preventDefault()
        e.stopPropagation()
        if (terminalStore.tabs.length > 1) {
          const currentIndex = terminalStore.tabs.findIndex(t => t.id === terminalStore.activeTabId)
          const nextIndex = (currentIndex + 1) % terminalStore.tabs.length
          terminalStore.setActiveTab(terminalStore.tabs[nextIndex].id)
        }
        return
      }

      // 切换到上一个标签页
      if (matchShortcut(e, shortcutSettings.prevTab)) {
        e.preventDefault()
        e.stopPropagation()
        if (terminalStore.tabs.length > 1) {
          const currentIndex = terminalStore.tabs.findIndex(t => t.id === terminalStore.activeTabId)
          const prevIndex = (currentIndex - 1 + terminalStore.tabs.length) % terminalStore.tabs.length
          terminalStore.setActiveTab(terminalStore.tabs[prevIndex].id)
        }
        return
      }

      // 垂直分屏（左右）
      if (matchShortcut(e, shortcutSettings.splitVertical)) {
        e.preventDefault()
        e.stopPropagation()
        const tabId = terminalStore.activeTabId
        if (tabId) {
          const tab = terminalStore.getTab(tabId)
          if (tab) {
            terminalStore.splitPane(tabId, tab.activePaneId, 'horizontal' as SplitDirection)
          }
        }
        return
      }

      // 水平分屏（上下）
      if (matchShortcut(e, shortcutSettings.splitHorizontal)) {
        e.preventDefault()
        e.stopPropagation()
        const tabId = terminalStore.activeTabId
        if (tabId) {
          const tab = terminalStore.getTab(tabId)
          if (tab) {
            terminalStore.splitPane(tabId, tab.activePaneId, 'vertical' as SplitDirection)
          }
        }
        return
      }

      // 关闭当前分屏
      if (matchShortcut(e, shortcutSettings.closePane)) {
        e.preventDefault()
        e.stopPropagation()
        const tabId = terminalStore.activeTabId
        if (tabId) {
          const tab = terminalStore.getTab(tabId)
          if (tab) {
            terminalStore.closePane(tabId, tab.activePaneId)
          }
        }
        return
      }

      // 快速连接
      if (matchShortcut(e, shortcutSettings.quickConnect)) {
        e.preventDefault()
        e.stopPropagation()
        setShowQuickConnect(true)
        return
      }

      // 切换全屏
      if (matchShortcut(e, shortcutSettings.toggleFullscreen)) {
        e.preventDefault()
        e.stopPropagation()
        await api.windowToggleFullscreen()
        const delays = [50, 100, 200, 400, 600]
        delays.forEach(delay => {
          setTimeout(() => window.dispatchEvent(new Event('resize')), delay)
        })
        return
      }
    }

    // 使用 capture 模式确保在终端之前拦截
    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [t, showSettings, showQuickConnect]) // 包含对话框状态用于 ESC 关闭

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
    useTerminalStore.getState().setActivePane(tabId, paneId)
  }, [setActiveTab])

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
    <div
      ref={appRef}
      tabIndex={0}
      className="flex flex-col h-screen bg-surface-0 text-text-primary outline-none"
    >
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
            setShowQuickConnect(false)
            handleQuickConnect(id)
          }}
        />
      )}
    </div>
  )
}

export default App