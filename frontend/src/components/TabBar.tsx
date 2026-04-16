import { useState, useEffect } from 'react'
import { useSessionStore } from '../stores/sessionStore'
import { useTerminalStore, SplitDirection, Tab } from '../stores/terminalStore'
import { useLocale } from '../stores/localeStore'
import { X, Copy, Columns, Rows } from 'lucide-react'
import { getFirstPane, getAllPaneIds } from '../utils/paneUtils'

interface Props {
  onCloneTab: (sessionId: string) => void
}

export function TabBar({ onCloneTab }: Props) {
  const { tabs, activeTabId, setActiveTab, closeTab, closePane, splitPane, getTab } = useTerminalStore()
  const { getTabStatus, disconnectTab, cleanupTab, confirmDialog } = useSessionStore()
  const { t } = useLocale()
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; tabId: string; sessionId: string } | null>(null)

  // 使用 paneId 获取状态颜色
  const getColor = (paneId: string) => {
    const s = getTabStatus(paneId)
    return s === 'connected' ? 'bg-green-500' : s === 'connecting' ? 'bg-yellow-500' : s === 'error' ? 'bg-red-500' : 'bg-gray-500'
  }

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
      <div className="h-8 bg-surface-1 border-b border-surface-2 flex items-center overflow-x-auto">
        {tabs.map(tab => {
          const firstPane = getFirstPane(tab.rootPane)
          const title = firstPane.title
          const sessionId = firstPane.sessionId
          // 使用活动 pane 的状态作为标签页状态指示
          const statusColor = getColor(tab.activePaneId)

          return (
            <div
              key={tab.id}
              className={`flex items-center gap-2 px-3 h-full cursor-pointer border-r border-surface-2 min-w-[100px] max-w-[180px] ${
                tab.id === activeTabId ? 'bg-surface-0 border-b-2 border-b-accent-blue' : 'hover:bg-surface-2'
              }`}
              onClick={() => setActiveTab(tab.id)}
              onContextMenu={(e) => handleContextMenu(e, tab.id, sessionId)}
            >
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColor}`} />
              <span className="text-sm text-text-primary truncate flex-1">{title}</span>
              <button
                type="button"
                className="flex items-center justify-center w-6 h-6 rounded hover:bg-red-500/20 text-text-muted hover:text-red-400 ml-1 flex-shrink-0"
                onMouseDown={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  handleCloseTab(e, tab)
                }}
              >
                <X size={14} />
              </button>
            </div>
          )
        })}
      </div>

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