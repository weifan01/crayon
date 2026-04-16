import { useState, useEffect, useRef } from 'react'
import { AlertCircle, Check, X, SkipForward, RefreshCw, FileText, Server, Terminal } from 'lucide-react'
import { useSettingsStore } from '../stores/settingsStore'
import { useLocale } from '../stores/localeStore'
import type { ImportSessionPreview, ImportCommandPreview, ImportPreview, ImportOptions } from '../api/wails'

interface ImportDialogProps {
  preview: ImportPreview
  onConfirm: (options: ImportOptions) => void
  onClose: () => void
}

export function ImportDialog({ preview, onConfirm, onClose }: ImportDialogProps) {
  const [sessionMode, setSessionMode] = useState<'skip' | 'overwrite' | 'rename'>('skip')
  const [commandMode, setCommandMode] = useState<'skip' | 'overwrite' | 'rename'>('skip')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // 拖拽状态
  const [position, setPosition] = useState({ x: (window.innerWidth - 700) / 2, y: 80 })
  const [isDragging, setIsDragging] = useState(false)
  const dragOffset = useRef({ x: 0, y: 0 })

  const { getTheme } = useSettingsStore()
  const { t } = useLocale()
  const theme = getTheme()

  // 默认全选
  useEffect(() => {
    const allIds = [
      ...preview.sessions.map(s => s.id),
      ...preview.commands.map(c => c.id)
    ]
    setSelectedIds(new Set(allIds))
  }, [])

  // 拖拽处理
  useEffect(() => {
    if (!isDragging) return
    const handleMouseMove = (e: MouseEvent) => {
      // 限制对话框位置，确保至少有一部分在屏幕内
      const dialogWidth = 700
      const minX = -dialogWidth + 100
      const maxX = window.innerWidth - 100
      const minY = 0
      const maxY = window.innerHeight - 100

      setPosition({
        x: Math.max(minX, Math.min(maxX, e.clientX - dragOffset.current.x)),
        y: Math.max(minY, Math.min(maxY, e.clientY - dragOffset.current.y)),
      })
    }
    const handleMouseUp = () => setIsDragging(false)
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging])

  const handleMouseDown = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).parentElement?.getBoundingClientRect()
    if (rect) {
      dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
      setIsDragging(true)
    }
  }

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    setSelectedIds(newSet)
  }

  const handleConfirm = () => {
    onConfirm({
      sessionMode,
      commandMode,
      selectedIds: Array.from(selectedIds)
    })
  }

  const selectedSessionCount = preview.sessions.filter(s => selectedIds.has(s.id)).length
  const selectedCommandCount = preview.commands.filter(c => selectedIds.has(c.id)).length

  return (
    <div
      className="dialog-panel overflow-hidden flex flex-col"
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        width: '700px',
        maxHeight: '80vh',
        zIndex: 1000,
        cursor: isDragging ? 'grabbing' : 'default',
      }}
    >
      {/* 头部 - 可拖拽 */}
      <div
        className="p-4 border-b border-surface-2 flex items-center justify-between"
        style={{ cursor: 'grab', userSelect: 'none' }}
        onMouseDown={handleMouseDown}
      >
        <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
          <FileText size={20} />
          {t('data.importPreview')}
        </h2>
        <button
          onClick={onClose}
          className="p-1 hover:bg-surface-2 rounded text-text-muted"
          style={{ cursor: 'pointer' }}
        >
          <X size={18} />
        </button>
      </div>

      {/* 统计信息 */}
      <div className="px-4 py-3 flex items-center gap-6 bg-surface-2/50">
        <div className="flex items-center gap-2">
          <Server size={16} style={{ color: theme.ui.accent }} />
          <span style={{ color: theme.ui.textPrimary }}>
            {t('data.sessions')}: {preview.totalSessions}
          </span>
          {preview.duplicateCount > 0 && (
            <span style={{ color: theme.ui.warning }}>
              ({preview.duplicateCount} {t('data.duplicates')})
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Terminal size={16} style={{ color: theme.ui.accent }} />
          <span style={{ color: theme.ui.textPrimary }}>
            {t('data.commands')}: {preview.totalCommands}
          </span>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* 冲突处理选项 */}
        {preview.duplicateCount > 0 && (
          <div
            className="mb-4 p-3 rounded-lg"
            style={{ backgroundColor: theme.ui.surface2 }}
          >
            <div className="flex items-center gap-2 mb-2" style={{ color: theme.ui.warning }}>
              <AlertCircle size={16} />
              <span className="font-medium">{t('data.conflictHandling')}</span>
            </div>

            {/* 会话冲突处理 */}
            <div className="mb-3">
              <label className="text-sm mb-1 block" style={{ color: theme.ui.textSecondary }}>
                {t('data.sessionConflict')}:
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setSessionMode('skip')}
                  className={`px-3 py-1.5 rounded text-sm flex items-center gap-1 ${
                    sessionMode === 'skip' ? '' : 'opacity-60'
                  }`}
                  style={{
                    backgroundColor: sessionMode === 'skip' ? theme.ui.accent : theme.ui.surface1,
                    color: sessionMode === 'skip' ? '#fff' : theme.ui.textPrimary,
                  }}
                >
                  <SkipForward size={14} /> {t('data.skip')}
                </button>
                <button
                  onClick={() => setSessionMode('overwrite')}
                  className={`px-3 py-1.5 rounded text-sm flex items-center gap-1 ${
                    sessionMode === 'overwrite' ? '' : 'opacity-60'
                  }`}
                  style={{
                    backgroundColor: sessionMode === 'overwrite' ? theme.ui.accent : theme.ui.surface1,
                    color: sessionMode === 'overwrite' ? '#fff' : theme.ui.textPrimary,
                  }}
                >
                  <RefreshCw size={14} /> {t('data.overwrite')}
                </button>
              </div>
            </div>

            {/* 命令冲突处理 */}
            <div>
              <label className="text-sm mb-1 block" style={{ color: theme.ui.textSecondary }}>
                {t('data.commandConflict')}:
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setCommandMode('skip')}
                  className={`px-3 py-1.5 rounded text-sm flex items-center gap-1 ${
                    commandMode === 'skip' ? '' : 'opacity-60'
                  }`}
                  style={{
                    backgroundColor: commandMode === 'skip' ? theme.ui.accent : theme.ui.surface1,
                    color: commandMode === 'skip' ? '#fff' : theme.ui.textPrimary,
                  }}
                >
                  <SkipForward size={14} /> {t('data.skip')}
                </button>
                <button
                  onClick={() => setCommandMode('overwrite')}
                  className={`px-3 py-1.5 rounded text-sm flex items-center gap-1 ${
                    commandMode === 'overwrite' ? '' : 'opacity-60'
                  }`}
                  style={{
                    backgroundColor: commandMode === 'overwrite' ? theme.ui.accent : theme.ui.surface1,
                    color: commandMode === 'overwrite' ? '#fff' : theme.ui.textPrimary,
                  }}
                >
                  <RefreshCw size={14} /> {t('data.overwrite')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 会话列表 */}
        <div className="mb-4">
          <h3 className="text-sm font-medium mb-2" style={{ color: theme.ui.textSecondary }}>
            {t('data.sessions')} ({selectedSessionCount}/{preview.sessions.length})
          </h3>
          <div className="space-y-1">
            {preview.sessions.map(session => (
              <div
                key={session.id}
                onClick={() => toggleSelect(session.id)}
                className="flex items-center gap-3 p-2 rounded cursor-pointer transition-colors"
                style={{
                  backgroundColor: selectedIds.has(session.id) ? theme.ui.accent + '20' : 'transparent',
                  border: `1px solid ${selectedIds.has(session.id) ? theme.ui.accent : theme.ui.border}`,
                }}
              >
                <div
                  className="w-4 h-4 rounded flex items-center justify-center"
                  style={{
                    backgroundColor: selectedIds.has(session.id) ? theme.ui.accent : 'transparent',
                    border: `1px solid ${theme.ui.border}`,
                  }}
                >
                  {selectedIds.has(session.id) && <Check size={12} color="#fff" />}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span style={{ color: theme.ui.textPrimary }}>{session.name}</span>
                    <span
                      className="text-xs px-1.5 py-0.5 rounded"
                      style={{
                        backgroundColor: session.isNew ? theme.ui.success + '20' : theme.ui.warning + '20',
                        color: session.isNew ? theme.ui.success : theme.ui.warning,
                      }}
                    >
                      {session.isNew ? t('data.new') : t('data.exists')}
                    </span>
                  </div>
                  <div className="text-xs" style={{ color: theme.ui.textMuted }}>
                    {session.protocol}://{session.host}
                    {!session.isNew && (
                      <span style={{ color: theme.ui.warning }}>
                        {' '}(→ {session.existsName})
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 命令列表 */}
        {preview.commands.length > 0 && (
          <div>
            <h3 className="text-sm font-medium mb-2" style={{ color: theme.ui.textSecondary }}>
              {t('data.commands')} ({selectedCommandCount}/{preview.commands.length})
            </h3>
            <div className="space-y-1">
              {preview.commands.map(cmd => (
                <div
                  key={cmd.id}
                  onClick={() => toggleSelect(cmd.id)}
                  className="flex items-center gap-3 p-2 rounded cursor-pointer transition-colors"
                  style={{
                    backgroundColor: selectedIds.has(cmd.id) ? theme.ui.accent + '20' : 'transparent',
                    border: `1px solid ${selectedIds.has(cmd.id) ? theme.ui.accent : theme.ui.border}`,
                  }}
                >
                  <div
                    className="w-4 h-4 rounded flex items-center justify-center"
                    style={{
                      backgroundColor: selectedIds.has(cmd.id) ? theme.ui.accent : 'transparent',
                      border: `1px solid ${theme.ui.border}`,
                    }}
                  >
                    {selectedIds.has(cmd.id) && <Check size={12} color="#fff" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span style={{ color: theme.ui.textPrimary }}>{cmd.name}</span>
                      <span
                        className="text-xs px-1.5 py-0.5 rounded"
                        style={{
                          backgroundColor: cmd.isNew ? theme.ui.success + '20' : theme.ui.warning + '20',
                          color: cmd.isNew ? theme.ui.success : theme.ui.warning,
                        }}
                      >
                        {cmd.isNew ? t('data.new') : t('data.exists')}
                      </span>
                    </div>
                    <div className="text-xs truncate" style={{ color: theme.ui.textMuted }}>
                      {cmd.content}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 底部按钮 */}
      <div className="p-4 border-t border-surface-2 flex justify-end gap-3">
        <button
          onClick={onClose}
          className="btn btn-secondary"
        >
          {t('common.cancel')}
        </button>
        <button
          onClick={handleConfirm}
          disabled={selectedSessionCount === 0 && selectedCommandCount === 0}
          className="btn btn-primary disabled:opacity-50"
        >
          {t('data.importSelected')} ({selectedSessionCount + selectedCommandCount})
        </button>
      </div>
    </div>
  )
}