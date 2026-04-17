import React from 'react'
import { Check, ChevronDown, ChevronRight, Folder } from 'lucide-react'
import { useLocale } from '../stores/localeStore'
import { useSessionStore } from '../stores/sessionStore'
import { PersonalizationTemplate, Session, GroupNode } from '../api/wails'
import { AppTheme } from './themes'

interface ApplySessionListProps {
  selectedTemplate: PersonalizationTemplate
  selectedSessions: Set<string>
  setSelectedSessions: (set: Set<string>) => void
  expandedGroups: Set<string>
  setExpandedGroups: (set: Set<string>) => void
  theme: AppTheme
}

export function ApplySessionList({
  selectedTemplate,
  selectedSessions,
  setSelectedSessions,
  expandedGroups,
  setExpandedGroups,
  theme,
}: ApplySessionListProps) {
  const { t } = useLocale()
  const { sessions, groupsTree } = useSessionStore()

  // 获取分组中的会话
  const getSessionsByPath = (path: string): Session[] => {
    return sessions.filter(s => s.group === path)
  }

  // 递归获取分组及子分组下的所有会话ID
  const getAllSessionIdsInGroup = (node: GroupNode): string[] => {
    const ids = getSessionsByPath(node.group.path).map(s => s.id)
    if (node.children) {
      for (const child of node.children) {
        ids.push(...getAllSessionIdsInGroup(child))
      }
    }
    return ids
  }

  // 检查分组是否全部选中
  const isGroupFullySelected = (node: GroupNode): boolean => {
    const ids = getAllSessionIdsInGroup(node)
    return ids.length > 0 && ids.every(id => selectedSessions.has(id))
  }

  // 检查分组是否部分选中
  const isGroupPartiallySelected = (node: GroupNode): boolean => {
    const ids = getAllSessionIdsInGroup(node)
    return ids.some(id => selectedSessions.has(id)) && !isGroupFullySelected(node)
  }

  // 切换分组选择
  const toggleGroupSelection = (node: GroupNode) => {
    const ids = getAllSessionIdsInGroup(node)
    const newSet = new Set(selectedSessions)
    if (isGroupFullySelected(node)) {
      ids.forEach(id => newSet.delete(id))
    } else {
      ids.forEach(id => newSet.add(id))
    }
    setSelectedSessions(newSet)
  }

  // 切换单个会话选择
  const toggleSessionSelection = (sessionId: string) => {
    const newSet = new Set(selectedSessions)
    if (newSet.has(sessionId)) {
      newSet.delete(sessionId)
    } else {
      newSet.add(sessionId)
    }
    setSelectedSessions(newSet)
  }

  // 切换分组展开
  const toggleGroupExpand = (groupId: string) => {
    const newSet = new Set(expandedGroups)
    if (newSet.has(groupId)) {
      newSet.delete(groupId)
    } else {
      newSet.add(groupId)
    }
    setExpandedGroups(newSet)
  }

  // 渲染分组节点
  const renderGroupNode = (node: GroupNode, depth: number = 0): React.ReactNode => {
    const g = node.group
    const hasChildren = node.children && node.children.length > 0
    const isExpanded = expandedGroups.has(g.id)
    const directSessions = getSessionsByPath(g.path)
    const indent = depth * 16
    const isFullySelected = isGroupFullySelected(node)
    const isPartiallySelected = isGroupPartiallySelected(node)

    return (
      <div key={g.id}>
        {/* 分组标题 */}
        <div
          className="px-3 py-2 flex items-center gap-2 cursor-pointer select-none"
          style={{ paddingLeft: `${12 + indent}px`, backgroundColor: theme.ui.surface2 }}
          onClick={() => toggleGroupSelection(node)}
        >
          {/* 分组复选框 */}
          <div
            className="w-4 h-4 rounded flex items-center justify-center"
            style={{
              backgroundColor: isFullySelected ? theme.ui.accent : 'transparent',
              border: `1px solid ${isFullySelected || isPartiallySelected ? theme.ui.accent : theme.ui.textMuted}`,
            }}
          >
            {isFullySelected && <Check size={12} style={{ color: '#fff' }} />}
            {isPartiallySelected && !isFullySelected && (
              <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: theme.ui.accent }} />
            )}
          </div>
          {/* 展开/折叠图标 */}
          <span onClick={(e) => { e.stopPropagation(); toggleGroupExpand(g.id) }} style={{ color: theme.ui.textMuted }}>
            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </span>
          <Folder size={14} style={{ color: isExpanded ? theme.ui.accent : theme.ui.textMuted }} />
          <span className="text-sm font-medium" style={{ color: theme.ui.textPrimary }}>{g.name}</span>
          <span className="text-xs ml-auto" style={{ color: theme.ui.textMuted }}>
            {getAllSessionIdsInGroup(node).length}
          </span>
        </div>

        {/* 会话列表和子分组 */}
        {isExpanded && (
          <>
            {/* 直接会话 */}
            {directSessions.map(session => {
              const isSelected = selectedSessions.has(session.id)
              const isApplied = session.templateId === selectedTemplate.id
              return (
                <div
                  key={session.id}
                  className="px-3 py-1.5 flex items-center gap-2 cursor-pointer"
                  style={{
                    paddingLeft: `${28 + indent}px`,
                    backgroundColor: isSelected ? theme.ui.accent + '15' : 'transparent',
                  }}
                  onClick={() => toggleSessionSelection(session.id)}
                >
                  {/* 会话复选框 */}
                  <div
                    className="w-4 h-4 rounded flex items-center justify-center"
                    style={{
                      backgroundColor: isSelected ? theme.ui.accent : 'transparent',
                      border: `1px solid ${isSelected ? theme.ui.accent : theme.ui.textMuted}`,
                    }}
                  >
                    {isSelected && <Check size={12} style={{ color: '#fff' }} />}
                  </div>
                  {/* 会话信息 */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate flex items-center gap-2" style={{ color: theme.ui.textPrimary }}>
                      {session.name || (session.protocol === 'local' ? (session.terminalType || 'Local') : session.host)}
                      {isApplied && (
                        <span
                          className="px-1.5 py-0.5 rounded text-xs"
                          style={{ backgroundColor: theme.ui.accent + '30', color: theme.ui.accent }}
                        >
                          {t('templates.applied')}
                        </span>
                      )}
                    </div>
                    <div className="text-xs" style={{ color: theme.ui.textMuted }}>
                      {session.protocol === 'local'
                        ? t('session.protocolLocal')
                        : `${session.host}:${session.port}`}
                    </div>
                  </div>
                </div>
              )
            })}
            {/* 子分组 */}
            {hasChildren && (
              <div>
                {node.children.map(child => renderGroupNode(child, depth + 1))}
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  // 未分组的会话
  const ungroupedSessions = sessions.filter(s => !s.group || s.group === '')
  const ungroupedId = 'ungrouped'
  const isUngroupedExpanded = expandedGroups.has(ungroupedId)
  const ungroupedIds = ungroupedSessions.map(s => s.id)
  const isUngroupedFullySelected = ungroupedIds.length > 0 && ungroupedIds.every(id => selectedSessions.has(id))
  const isUngroupedPartiallySelected = ungroupedIds.some(id => selectedSessions.has(id)) && !isUngroupedFullySelected

  const toggleUngroupedSelection = () => {
    const newSet = new Set(selectedSessions)
    if (isUngroupedFullySelected) {
      ungroupedIds.forEach(id => newSet.delete(id))
    } else {
      ungroupedIds.forEach(id => newSet.add(id))
    }
    setSelectedSessions(newSet)
  }

  return (
    <div className="overflow-y-auto max-h-[55vh]">
      {sessions.length === 0 ? (
        <div className="text-center py-8" style={{ color: theme.ui.textMuted }}>
          {t('sidebar.noSessions')}
        </div>
      ) : (
        <div>
          {/* 分组树 */}
          {groupsTree.map(node => renderGroupNode(node))}

          {/* 未分组会话 */}
          {ungroupedSessions.length > 0 && (
            <div key={ungroupedId}>
              {/* 未分组标题 */}
              <div
                className="px-3 py-2 flex items-center gap-2 cursor-pointer select-none"
                style={{ backgroundColor: theme.ui.surface2 }}
                onClick={toggleUngroupedSelection}
              >
                {/* 复选框 */}
                <div
                  className="w-4 h-4 rounded flex items-center justify-center"
                  style={{
                    backgroundColor: isUngroupedFullySelected ? theme.ui.accent : 'transparent',
                    border: `1px solid ${isUngroupedFullySelected || isUngroupedPartiallySelected ? theme.ui.accent : theme.ui.textMuted}`,
                  }}
                >
                  {isUngroupedFullySelected && <Check size={12} style={{ color: '#fff' }} />}
                  {isUngroupedPartiallySelected && !isUngroupedFullySelected && (
                    <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: theme.ui.accent }} />
                  )}
                </div>
                {/* 展开/折叠 */}
                <span onClick={(e) => { e.stopPropagation(); toggleGroupExpand(ungroupedId) }} style={{ color: theme.ui.textMuted }}>
                  {isUngroupedExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </span>
                <Folder size={14} style={{ color: isUngroupedExpanded ? theme.ui.accent : theme.ui.textMuted }} />
                <span className="text-sm font-medium" style={{ color: theme.ui.textPrimary }}>{t('sidebar.ungrouped')}</span>
                <span className="text-xs ml-auto" style={{ color: theme.ui.textMuted }}>{ungroupedSessions.length}</span>
              </div>

              {/* 未分组会话列表 */}
              {isUngroupedExpanded && ungroupedSessions.map(session => {
                const isSelected = selectedSessions.has(session.id)
                const isApplied = session.templateId === selectedTemplate.id
                return (
                  <div
                    key={session.id}
                    className="px-3 py-1.5 flex items-center gap-2 cursor-pointer"
                    style={{ backgroundColor: isSelected ? theme.ui.accent + '15' : 'transparent', paddingLeft: '28px' }}
                    onClick={() => toggleSessionSelection(session.id)}
                  >
                    <div
                      className="w-4 h-4 rounded flex items-center justify-center"
                      style={{
                        backgroundColor: isSelected ? theme.ui.accent : 'transparent',
                        border: `1px solid ${isSelected ? theme.ui.accent : theme.ui.textMuted}`,
                      }}
                    >
                      {isSelected && <Check size={12} style={{ color: '#fff' }} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate flex items-center gap-2" style={{ color: theme.ui.textPrimary }}>
                        {session.name || (session.protocol === 'local' ? (session.terminalType || 'Local') : session.host)}
                        {isApplied && (
                          <span
                            className="px-1.5 py-0.5 rounded text-xs"
                            style={{ backgroundColor: theme.ui.accent + '30', color: theme.ui.accent }}
                          >
                            {t('templates.applied')}
                          </span>
                        )}
                      </div>
                      <div className="text-xs" style={{ color: theme.ui.textMuted }}>
                        {session.protocol === 'local'
                          ? t('session.protocolLocal')
                          : `${session.host}:${session.port}`}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}