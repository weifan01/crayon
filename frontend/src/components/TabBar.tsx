import { useState, useEffect, useRef } from 'react'
import { useSessionStore } from '../stores/sessionStore'
import { useTerminalStore, SplitDirection, Tab } from '../stores/terminalStore'
import { useLocale } from '../stores/localeStore'
import { X, Copy, Columns, Rows, ChevronLeft, ChevronRight } from 'lucide-react'
import { getFirstPane, getAllPaneIds } from '../utils/paneUtils'

interface Props {
  onCloneTab: (sessionId: string) => void
}

export function TabBar({ onCloneTab }: Props) {
  const { tabs, activeTabId, setActiveTab, closeTab, splitPane, getTab } = useTerminalStore()
  const { getTabStatus, disconnectTab, cleanupTab, confirmDialog } = useSessionStore()
  const { t } = useLocale()
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; tabId: string; sessionId: string } | null>(null)
  const [tooltip, setTooltip] = useState<{ title: string; x: number; y: number } | null>(null)
  const [showScrollButtons, setShowScrollButtons] = useState(false)
  const tooltipTimerRef = useRef<NodeJS.Timeout | null>(null)
  const tabRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const tabsContainerRef = useRef<HTMLDivElement>(null)

  // 使用 paneId 获取状态颜色
  const getColor = (paneId: string) => {
    const s = getTabStatus(paneId)
    return s === 'connected' ? 'bg-green-500' : s === 'connecting' ? 'bg-yellow-500' : s === 'error' ? 'bg-red-500' : 'bg-gray-500'
  }

  // 检测是否需要显示滚动按钮
  useEffect(() => {
    const checkScroll = () => {
      if (!tabsContainerRef.current) return
      const { scrollWidth, clientWidth } = tabsContainerRef.current
      setShowScrollButtons(scrollWidth > clientWidth + 10)
    }
    checkScroll()
    window.addEventListener('resize', checkScroll)
    return () => window.removeEventListener('resize', checkScroll)
  }, [tabs])

  // 活动标签页滚动到可见区域
  useEffect(() => {
    if (!activeTabId) return
    const activeTabEl = tabRefs.current[activeTabId]
    if (!activeTabEl) return
    activeTabEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [activeTabId])

  // 左右滚动
  const scrollTabs = (direction: 'left' | 'right') => {
    if (!tabsContainerRef.current) return
    const scrollAmount = 150
    tabsContainerRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth'
    })
  }

  // 处理鼠标悬停 - 200ms后显示tooltip
  const handleTabMouseEnter = (tabId: string) => {
    if (tooltipTimerRef.current) {
      clearTimeout(tooltipTimerRef.current)
    }

    tooltipTimerRef.current = setTimeout(() => {
      const tabEl = tabRefs.current[tabId]
      if (!tabEl) return

      // 检测标题是否被截断（性能优化：未截断时不显示 tooltip）
      const textEl = tabEl.querySelector('.truncate')
      if (textEl && textEl.scrollWidth <= textEl.clientWidth) {
        // 标题完整显示，不需要 tooltip
        return
      }

      const currentTabs = useTerminalStore.getState().tabs
      const tab = currentTabs.find(t => t.id === tabId)
      if (!tab) return
      const title = getFirstPane(tab.rootPane).title

      const rect = tabEl.getBoundingClientRect()
      setTooltip({
        title,
        x: rect.left + rect.width / 2,
        y: rect.top - 4
      })
    }, 200)
  }

  const handleTabMouseLeave = () => {
    if (tooltipTimerRef.current) {
      clearTimeout(tooltipTimerRef.current)
      tooltipTimerRef.current = null
    }
    setTooltip(null)
  }

  // 清理定时器
  useEffect(() => {
    return () => {
      if (tooltipTimerRef.current) {
        clearTimeout(tooltipTimerRef.current)
      }
    }
  }, [])

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null)
    if (contextMenu) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [contextMenu])

  // ESC 关闭右键菜单
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && contextMenu) {
        setContextMenu(null)
      }
    }
    if (contextMenu) {
      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }
  }, [contextMenu])

  const handleContextMenu = (e: React.MouseEvent, tabId: string, sessionId: string) => {
    e.preventDefault()
    e.stopPropagation()
    const x = Math.min(e.clientX, window.innerWidth - 160)
    const y = Math.min(e.clientY, window.innerHeight - 180)
    setContextMenu({ x, y, tabId, sessionId })
  }

  // 关闭标签页
  const handleCloseTab = async (e: React.MouseEvent, tab: Tab) => {
    e.stopPropagation()
    e.preventDefault()

    // 获取所有 pane 的 ID，检查是否有连接的
    const allPaneIds = getAllPaneIds(tab.rootPane)
    const connectedPaneIds = allPaneIds.filter(id => getTabStatus(id) === 'connected')

    if (connectedPaneIds.length > 0) {
      const confirmed = await confirmDialog(t('confirm.closeTab'), t('confirm.closeTabMsg'))
      if (!confirmed) {
        return
      }
      // 断开所有连接
      for (const paneId of connectedPaneIds) {
        await disconnectTab(paneId)
        cleanupTab(paneId)
      }
    }

    closeTab(tab.id)
  }

  // 右键菜单操作
  const handleMenuClose = async () => {
    if (!contextMenu) return
    const tab = tabs.find(t => t.id === contextMenu.tabId)
    if (!tab) return

    const allPaneIds = getAllPaneIds(tab.rootPane)
    const connectedPaneIds = allPaneIds.filter(id => getTabStatus(id) === 'connected')

    if (connectedPaneIds.length > 0) {
      const confirmed = await confirmDialog(t('confirm.closeTab'), t('confirm.closeTabMsg'))
      if (!confirmed) {
        setContextMenu(null)
        return
      }
      for (const paneId of connectedPaneIds) {
        await disconnectTab(paneId)
        cleanupTab(paneId)
      }
    }

    closeTab(tab.id)
    setContextMenu(null)
  }

  const handleMenuCloseOthers = async () => {
    if (!contextMenu) return
    // 检查是否有已连接的标签页
    const otherTabs = tabs.filter(t => t.id !== contextMenu.tabId)
    let connectedCount = 0
    for (const tab of otherTabs) {
      const allPaneIds = getAllPaneIds(tab.rootPane)
      connectedCount += allPaneIds.filter(id => getTabStatus(id) === 'connected').length
    }

    if (connectedCount > 0) {
      const confirmed = await confirmDialog(t('confirm.closeApp'), t('confirm.closeAppMsg').replace('{count}', String(connectedCount)))
      if (!confirmed) {
        setContextMenu(null)
        return
      }
    }

    for (const tab of otherTabs) {
      const allPaneIds = getAllPaneIds(tab.rootPane)
      for (const paneId of allPaneIds) {
        if (getTabStatus(paneId) === 'connected') {
          await disconnectTab(paneId)
        }
        cleanupTab(paneId)
      }
      closeTab(tab.id)
    }
    setContextMenu(null)
  }

  const handleMenuCloseAll = async () => {
    if (!contextMenu) return
    // 检查是否有已连接的标签页
    let connectedCount = 0
    for (const tab of tabs) {
      const allPaneIds = getAllPaneIds(tab.rootPane)
      connectedCount += allPaneIds.filter(id => getTabStatus(id) === 'connected').length
    }

    if (connectedCount > 0) {
      const confirmed = await confirmDialog(t('confirm.closeApp'), t('confirm.closeAppMsg').replace('{count}', String(connectedCount)))
      if (!confirmed) {
        setContextMenu(null)
        return
      }
    }

    for (const tab of [...tabs]) {
      const allPaneIds = getAllPaneIds(tab.rootPane)
      for (const paneId of allPaneIds) {
        if (getTabStatus(paneId) === 'connected') {
          await disconnectTab(paneId)
        }
        cleanupTab(paneId)
      }
      closeTab(tab.id)
    }
    setContextMenu(null)
  }

  const handleMenuClone = () => {
    if (contextMenu) {
      onCloneTab(contextMenu.sessionId)
      setContextMenu(null)
    }
  }

  const handleMenuSplitVertical = () => {
    if (contextMenu) {
      const tab = getTab(contextMenu.tabId)
      if (tab) {
        splitPane(contextMenu.tabId, tab.activePaneId, 'horizontal' as SplitDirection)
      }
      setContextMenu(null)
    }
  }

  const handleMenuSplitHorizontal = () => {
    if (contextMenu) {
      const tab = getTab(contextMenu.tabId)
      if (tab) {
        splitPane(contextMenu.tabId, tab.activePaneId, 'vertical' as SplitDirection)
      }
      setContextMenu(null)
    }
  }

  if (!tabs.length) {
    return <div className="h-8 bg-surface-1 border-b border-surface-2 flex items-center px-4 text-text-muted text-sm">{t('tabBar.noSession')}</div>
  }

  return (
    <>
      <div className="h-8 bg-surface-1 border-b border-surface-2 flex items-center">
        {/* 左侧滚动按钮 */}
        {showScrollButtons && (
          <button
            className="flex items-center justify-center w-6 h-full hover:bg-surface-2 text-accent-blue hover:text-accent-blue/80"
            onClick={() => scrollTabs('left')}
          >
            <ChevronLeft size={16} />
          </button>
        )}

        {/* 标签页容器 - 隐藏滚动条 */}
        <div
          ref={tabsContainerRef}
          className="flex-1 flex items-center overflow-x-auto scrollbar-hide"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {tabs.map(tab => {
            const firstPane = getFirstPane(tab.rootPane)
            const title = firstPane.title
            const sessionId = firstPane.sessionId
            const statusColor = getColor(tab.activePaneId)
            const isActive = tab.id === activeTabId

            return (
              <div
                key={tab.id}
                ref={el => tabRefs.current[tab.id] = el}
                className={`flex items-center gap-1.5 px-1.5 h-full cursor-pointer border-r border-surface-2 ${
                  isActive
                    ? 'bg-surface-0 border-b-2 border-b-accent-blue flex-shrink-0'
                    : 'hover:bg-surface-2 flex-shrink min-w-[60px] max-w-[160px]'
                }`}
                onClick={() => setActiveTab(tab.id)}
                onContextMenu={(e) => handleContextMenu(e, tab.id, sessionId)}
                onMouseEnter={() => handleTabMouseEnter(tab.id)}
                onMouseLeave={handleTabMouseLeave}
              >
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColor}`} />
                <span className={`text-sm text-text-primary ${isActive ? '' : 'truncate'}`}>{title}</span>
                <button
                  type="button"
                  className="flex items-center justify-center w-4 h-4 rounded hover:bg-red-500/20 text-text-muted hover:text-red-400 flex-shrink-0"
                  onMouseDown={(e) => {
                    e.stopPropagation()
                    e.preventDefault()
                    handleCloseTab(e, tab)
                  }}
                >
                  <X size={10} />
                </button>
              </div>
            )
          })}
        </div>

        {/* 右侧滚动按钮 */}
        {showScrollButtons && (
          <button
            className="flex items-center justify-center w-6 h-full hover:bg-surface-2 text-accent-blue hover:text-accent-blue/80"
            onClick={() => scrollTabs('right')}
          >
            <ChevronRight size={16} />
          </button>
        )}
      </div>

      {/* Tooltip - fixed 定位不受 overflow 裁剪 */}
      {tooltip && (
        <div
          className="fixed px-2 py-1 bg-surface-2 border border-surface-3 text-text-primary text-xs rounded shadow-lg whitespace-nowrap z-[9999] pointer-events-none"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translateX(-50%) translateY(-100%)'
          }}
        >
          {tooltip.title}
        </div>
      )}

      {/* 右键菜单 */}
      {contextMenu && (
        <div
          className="fixed bg-surface-1 border border-surface-2 rounded-lg shadow-xl py-1 z-[9999] min-w-[140px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <div
            className="w-full px-3 py-2 text-sm text-text-primary hover:bg-surface-2 flex items-center gap-2 cursor-pointer"
            onClick={handleMenuSplitVertical}
          >
            <Columns size={14} />
            {t('tabBar.splitVertical')}
          </div>
          <div
            className="w-full px-3 py-2 text-sm text-text-primary hover:bg-surface-2 flex items-center gap-2 cursor-pointer"
            onClick={handleMenuSplitHorizontal}
          >
            <Rows size={14} />
            {t('tabBar.splitHorizontal')}
          </div>
          <div className="border-t border-surface-2 my-1" />
          <div
            className="w-full px-3 py-2 text-sm text-text-primary hover:bg-surface-2 flex items-center gap-2 cursor-pointer"
            onClick={handleMenuClone}
          >
            <Copy size={14} />
            {t('tabBar.cloneTab')}
          </div>
          <div className="border-t border-surface-2 my-1" />
          <div
            className="w-full px-3 py-2 text-sm text-text-primary hover:bg-surface-2 cursor-pointer"
            onClick={handleMenuClose}
          >
            {t('tabBar.close')}
          </div>
          <div
            className="w-full px-3 py-2 text-sm text-text-primary hover:bg-surface-2 cursor-pointer"
            onClick={handleMenuCloseOthers}
          >
            {t('tabBar.closeOthers')}
          </div>
          <div
            className="w-full px-3 py-2 text-sm text-accent-red hover:bg-surface-2 cursor-pointer"
            onClick={handleMenuCloseAll}
          >
            {t('tabBar.closeAll')}
          </div>
        </div>
      )}
    </>
  )
}