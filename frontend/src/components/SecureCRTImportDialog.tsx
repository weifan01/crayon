import { useState, useEffect } from 'react'
import { FileText, Check, X, Folder, Server, Key, Lock, ChevronDown, ChevronRight } from 'lucide-react'
import { api, SecureCRTSessionPreview } from '../api/wails'
import { useLocale } from '../stores/localeStore'
import { useSettingsStore } from '../stores/settingsStore'

interface Props {
  filePath: string
  onClose: () => void
  onImported: () => void
}

// 扩展会话类型，包含原始索引
interface SessionWithIndex extends SecureCRTSessionPreview {
  _originalIndex: number
}

// 分组会话映射
interface GroupedSessions {
  [groupPath: string]: SessionWithIndex[]
}

export function SecureCRTImportDialog({ filePath, onClose, onImported }: Props) {
  const { t } = useLocale()
  const { getTheme } = useSettingsStore()
  const theme = getTheme()

  const [sessions, setSessions] = useState<SessionWithIndex[]>([])
  const [selectedIndexes, setSelectedIndexes] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  useEffect(() => {
    loadPreview()
  }, [filePath])

  // ESC 关闭对话框
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [onClose])

  const loadPreview = async () => {
    setLoading(true)
    setError('')
    try {
      const result = await api.parseSecureCRTFile(filePath)
      // 给每个会话添加原始索引
      const sessionsWithIndex: SessionWithIndex[] = result.sessions.map((s, i) => ({
        ...s,
        _originalIndex: i
      }))
      setSessions(sessionsWithIndex)
      // 默认全选（使用索引集合）
      setSelectedIndexes(new Set(sessionsWithIndex.map(s => s._originalIndex)))
      // 默认展开所有分组
      setExpandedGroups(new Set(result.groups))
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  // 按分组组织会话
  const groupedSessions: GroupedSessions = sessions.reduce((acc, session) => {
    const group = session.group || t('sidebar.noGroup')
    if (!acc[group]) {
      acc[group] = []
    }
    acc[group].push(session)
    return acc
  }, {} as GroupedSessions)

  // 切换单个会话选中状态
  const toggleSession = (originalIndex: number) => {
    const newSet = new Set(selectedIndexes)
    if (newSet.has(originalIndex)) {
      newSet.delete(originalIndex)
    } else {
      newSet.add(originalIndex)
    }
    setSelectedIndexes(newSet)
  }

  // 切换分组选中状态
  const toggleGroup = (groupPath: string) => {
    const groupSessions = groupedSessions[groupPath] || []
    if (groupSessions.length === 0) return

    // 检查当前分组是否全部选中
    const allSelected = groupSessions.every(s => selectedIndexes.has(s._originalIndex))

    const newSet = new Set(selectedIndexes)
    groupSessions.forEach(s => {
      if (allSelected) {
        // 全选状态：取消选中
        newSet.delete(s._originalIndex)
      } else {
        // 部分选中或全不选：全部选中
        newSet.add(s._originalIndex)
      }
    })
    setSelectedIndexes(newSet)
  }

  // 全选
  const selectAll = () => {
    setSelectedIndexes(new Set(sessions.map(s => s._originalIndex)))
  }

  // 取消全选
  const deselectAll = () => {
    setSelectedIndexes(new Set())
  }

  // 切换分组展开状态
  const toggleExpandGroup = (groupPath: string) => {
    const newSet = new Set(expandedGroups)
    if (newSet.has(groupPath)) {
      newSet.delete(groupPath)
    } else {
      newSet.add(groupPath)
    }
    setExpandedGroups(newSet)
  }

  // 检查分组选中状态：'all' | 'partial' | 'none'
  const getGroupSelectState = (groupPath: string): 'all' | 'partial' | 'none' => {
    const groupSessions = groupedSessions[groupPath] || []
    if (groupSessions.length === 0) return 'none'

    const selectedCount = groupSessions.filter(s => selectedIndexes.has(s._originalIndex)).length
    if (selectedCount === 0) return 'none'
    if (selectedCount === groupSessions.length) return 'all'
    return 'partial'
  }

  const handleImport = async () => {
    setImporting(true)
    setError('')
    try {
      // 获取选中的会话
      const selectedSessions = sessions
        .filter(s => selectedIndexes.has(s._originalIndex))
        .map(s => ({
          name: s.name,
          group: s.group,
          host: s.host,
          port: s.port,
          protocol: s.protocol,
          user: s.username,
          authType: s.authType,
          keyPath: s.keyPath,
        }))

      await api.importSecureCRTSessions(selectedSessions)
      onImported()
      onClose()
    } catch (e) {
      setError(String(e))
    } finally {
      setImporting(false)
    }
  }

  const selectedCount = selectedIndexes.size

  return (
    <div
      className="dialog-panel flex flex-col"
      style={{
        position: 'fixed',
        left: (window.innerWidth - 700) / 2,
        top: 80,
        width: 700,
        maxHeight: '85vh',
        zIndex: 1001,
      }}
    >
      {/* 头部 */}
      <div className="p-4 border-b border-surface-2 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2">
          <FileText size={20} />
          {t('data.securecrtPreview')}
        </h3>
        <button
          onClick={onClose}
          className="p-1 hover:bg-surface-2 rounded text-text-muted"
          style={{ cursor: 'pointer' }}
        >
          <X size={18} />
        </button>
      </div>

      {/* 内容 */}
      <div className="p-4 overflow-y-auto flex-1">
        {loading && (
          <div className="text-center py-8 text-text-muted">{t('common.loading')}</div>
        )}

        {error && (
          <div className="p-3 rounded-lg text-red-400 text-sm"
            style={{ backgroundColor: 'rgba(239,68,68,0.1)' }}>
            {error}
          </div>
        )}

        {!loading && !error && (
          <>
            {/* 统计和操作 */}
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm text-text-muted">
                {t('data.securecrtSelected').replace('{count}', String(selectedCount))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={selectAll}
                  className="px-3 py-1.5 text-sm rounded hover:bg-surface-2"
                  style={{ color: theme.ui.accent }}
                >
                  {t('data.securecrtSelectAll')}
                </button>
                <button
                  onClick={deselectAll}
                  className="px-3 py-1.5 text-sm rounded hover:bg-surface-2"
                  style={{ color: theme.ui.textMuted }}
                >
                  {t('data.securecrtDeselectAll')}
                </button>
              </div>
            </div>

            {/* 分组列表 */}
            <div className="space-y-2">
              {Object.entries(groupedSessions).map(([groupPath, groupSessions]) => {
                const selectState = getGroupSelectState(groupPath)
                return (
                  <div key={groupPath}>
                    {/* 分组头部 */}
                    <div
                      className="flex items-center gap-2 p-2 rounded-lg cursor-pointer hover:bg-surface-2"
                      style={{ backgroundColor: theme.ui.surface1 }}
                      onClick={() => toggleExpandGroup(groupPath)}
                    >
                      {/* 分组选择复选框 */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleGroup(groupPath)
                        }}
                        className="w-5 h-5 rounded flex items-center justify-center transition-colors"
                        style={{
                          backgroundColor: selectState === 'all' ? theme.ui.accent : 'transparent',
                          border: `2px solid ${selectState === 'partial' ? theme.ui.accent : theme.ui.border}`,
                          color: selectState === 'all' ? '#fff' : theme.ui.accent,
                        }}
                      >
                        {selectState === 'all' && <Check size={14} />}
                        {selectState === 'partial' && (
                          <div style={{
                            width: 8,
                            height: 8,
                            borderRadius: 1,
                            backgroundColor: theme.ui.accent
                          }} />
                        )}
                      </button>
                      {expandedGroups.has(groupPath) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      <Folder size={16} style={{ color: theme.ui.accent }} />
                      <span className="font-medium text-sm" style={{ color: theme.ui.textPrimary }}>
                        {groupPath || t('sidebar.noGroup')}
                      </span>
                      <span className="text-xs text-text-muted">
                        ({groupSessions.filter(s => selectedIndexes.has(s._originalIndex)).length}/{groupSessions.length})
                      </span>
                    </div>

                    {/* 会话列表 */}
                    {expandedGroups.has(groupPath) && (
                      <div className="ml-4 mt-1 space-y-1">
                        {groupSessions.map((session) => {
                          const isSelected = selectedIndexes.has(session._originalIndex)
                          return (
                            <div
                              key={session._originalIndex}
                              className="flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors"
                              style={{
                                backgroundColor: isSelected ? theme.ui.accent + '20' : 'transparent',
                                border: `1px solid ${isSelected ? theme.ui.accent : theme.ui.border}`,
                              }}
                              onClick={() => toggleSession(session._originalIndex)}
                            >
                              {/* 会话选择复选框 */}
                              <div
                                className="w-4 h-4 rounded flex items-center justify-center transition-colors"
                                style={{
                                  backgroundColor: isSelected ? theme.ui.accent : 'transparent',
                                  border: `2px solid ${isSelected ? theme.ui.accent : theme.ui.border}`,
                                }}
                              >
                                {isSelected && <Check size={12} color="#fff" />}
                              </div>
                              <Server size={14} style={{ color: theme.ui.textSecondary }} />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm truncate" style={{ color: theme.ui.textPrimary }}>
                                  {session.name}
                                </div>
                                <div className="text-xs truncate" style={{ color: theme.ui.textMuted }}>
                                  {session.host}:{session.port} · {session.username}
                                </div>
                              </div>
                              {/* 认证方式标识 */}
                              <div
                                className="px-2 py-1 rounded text-xs"
                                style={{
                                  backgroundColor: session.authType === 'key'
                                    ? theme.ui.success + '20'
                                    : theme.ui.warning + '20',
                                  color: session.authType === 'key'
                                    ? theme.ui.success
                                    : theme.ui.warning,
                                }}
                              >
                                {session.authType === 'key'
                                  ? <Key size={12} />
                                  : <Lock size={12} />}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* 底部按钮 */}
      <div className="p-4 border-t border-surface-2 flex justify-end gap-3">
        <button onClick={onClose} className="btn btn-secondary" disabled={importing}>
          {t('common.cancel')}
        </button>
        <button
          onClick={handleImport}
          className="btn btn-primary"
          disabled={importing || selectedCount === 0}
        >
          {importing ? t('common.importing') : t('common.import') + ` (${selectedCount})`}
        </button>
      </div>
    </div>
  )
}