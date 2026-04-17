import { useState, useEffect } from 'react'
import { useSessionStore } from '../stores/sessionStore'
import { useTerminalStore } from '../stores/terminalStore'
import { useLocale } from '../stores/localeStore'
import { findPane } from '../utils/paneUtils'

// 格式化时长（秒 -> HH:MM:SS）
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

// 格式化时间（HH:MM:SS）
function formatTime(date: Date): string {
  return date.toLocaleTimeString('zh-CN', { hour12: false })
}

export function StatusBar() {
  const { activeTabId, tabs, cursorPositions } = useTerminalStore()
  const { sessions, getTabStatus, getConnectionDuration } = useSessionStore()
  const { t } = useLocale()
  const [currentTime, setCurrentTime] = useState(new Date())
  const [connectionDuration, setConnectionDuration] = useState(0)

  // 更新当前时间
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // 更新连接时长
  useEffect(() => {
    if (!activeTabId) {
      setConnectionDuration(0)
      return
    }
    const tab = tabs.find(t => t.id === activeTabId)
    if (!tab) {
      setConnectionDuration(0)
      return
    }

    const timer = setInterval(() => {
      // 使用活动 pane 的连接时长
      setConnectionDuration(getConnectionDuration(tab.activePaneId))
    }, 1000)
    return () => clearInterval(timer)
  }, [activeTabId, tabs, getConnectionDuration])

  const tab = activeTabId ? tabs.find(t => t.id === activeTabId) : null
  const activePane = tab ? findPane(tab.rootPane, tab.activePaneId) : null
  const session = activePane ? sessions.find((s: any) => s.id === activePane.sessionId) : null
  const status = activePane ? getTabStatus(activePane.id) : 'disconnected'
  const cursorPos = activePane ? cursorPositions[activePane.id] : null

  const cfg: Record<string, { text: string; color: string; dot: string }> = {
    connected: { text: t('status.connected'), color: 'text-green-400', dot: 'bg-green-400' },
    connecting: { text: t('status.connecting'), color: 'text-yellow-400', dot: 'bg-yellow-400' },
    error: { text: t('status.error'), color: 'text-red-400', dot: 'bg-red-400' },
    disconnected: { text: t('status.disconnected'), color: 'text-gray-500', dot: 'bg-gray-500' },
  }
  const s = cfg[status] || cfg.disconnected

  return (
    <div className="h-6 bg-surface-1 border-t border-surface-2 flex items-center px-3 text-xs gap-4">
      {/* 左侧：连接状态和SSH信息 */}
      <div className="flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
        <span className={s.color}>{s.text}</span>
      </div>
      {session && (
        <>
          <span className="text-text-muted">|</span>
          <span className="text-text-secondary">{(session as any).protocol?.toUpperCase()}</span>
          <span className="text-text-primary">{(session as any).host}:{(session as any).port}</span>
        </>
      )}
      {/* 连接时长 */}
      {status === 'connected' && connectionDuration > 0 && (
        <>
          <span className="text-text-muted">|</span>
          <span className="text-text-secondary">{t('statusBar.sessionDuration')}:</span>
          <span className="text-text-primary font-mono">{formatDuration(connectionDuration)}</span>
        </>
      )}

      {/* 右侧：终端信息和时间 */}
      <div className="ml-auto flex items-center gap-4">
        {/* 窗口尺寸 */}
        {activePane && (
          <div className="flex items-center gap-2">
            <span className="text-text-secondary">{t('statusBar.size')}:</span>
            <span className="text-text-primary font-mono">{activePane.rows}x{activePane.cols}</span>
          </div>
        )}
        {/* 光标位置 */}
        {cursorPos && (
          <div className="flex items-center gap-2">
            <span className="text-text-secondary">{t('statusBar.cursor')}:</span>
            <span className="text-text-primary font-mono">{cursorPos.row},{cursorPos.col}</span>
          </div>
        )}
        {/* 当前时间 */}
        <span className="text-text-secondary font-mono">{formatTime(currentTime)}</span>
      </div>
    </div>
  )
}