import { useEffect, useState, useRef, useCallback } from 'react'
import { useSessionStore } from '../stores/sessionStore'
import { useSidebarSettings } from '../stores/sidebarSettingsStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useLocale } from '../stores/localeStore'
import { Plus, Folder, Server, Edit3, Trash2, Copy, MoveRight, ChevronRight, ChevronDown, PanelLeftClose, Pin, GripVertical, Settings, FolderPlus, Terminal, Zap, X, Key, Globe, Cpu, ListTree, ListMinus, Sliders } from 'lucide-react'
import type { Session, GroupNode } from '../api/wails'
import { api } from '../api/wails'
import { GroupManager } from './GroupManager'
import { CommandPanel } from './CommandPanel'
import { QuickConnect } from './QuickConnect'

interface Props {
  onSelectSession: (id: string) => void
  onDoubleClickSession?: (id: string) => void
  onOpenSettings: () => void
  onQuickConnect?: (id: string) => void
}

interface ContextMenuState {
  x: number
  y: number
  session: Session
  groupMenuMode: 'move' | 'copy' | null
}

type SidebarMode = 'always-show' | 'auto-hide'

export function Sidebar({ onSelectSession, onDoubleClickSession, onOpenSettings, onQuickConnect }: Props) {
  const { sessions, groups, groupsTree, loading, loadSessions, loadGroups, loadGroupsTree, createSession, updateSession, deleteSession, cloneSession, searchSessions, getSessionStatus, confirmDialog } = useSessionStore()
  const { sidebar, setSidebarWidth, setSidebarMode } = useSidebarSettings()
  const { themes, sidebarTagSettings, setSidebarTagSettings } = useSettingsStore()
  const { t } = useLocale()

  const [kw, setKw] = useState('')
  const [show, setShow] = useState(false)
  const [showGroups, setShowGroups] = useState(false)
  const [showCommands, setShowCommands] = useState(false)
  const [showQuickConnect, setShowQuickConnect] = useState(false)
  const [showModeMenu, setShowModeMenu] = useState(false)
  const [edit, setEdit] = useState<Partial<Session>>({})
  const [isNew, setIsNew] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [isResizing, setIsResizing] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['ungrouped']))

  // 多选状态
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set())
  const [lastClickedId, setLastClickedId] = useState<string | null>(null)
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null)
  const [showBatchGroupMenu, setShowBatchGroupMenu] = useState(false)

  // 拖拽状态
  const [dialogPosition, setDialogPosition] = useState({ x: (window.innerWidth - 480) / 2, y: 80 })
  const [isDraggingDialog, setIsDraggingDialog] = useState(false)
  const dragOffset = useRef({ x: 0, y: 0 })

  const contextMenuRef = useRef<HTMLDivElement>(null)
  const resizeRef = useRef<HTMLDivElement>(null)
  const sidebarRef = useRef<HTMLDivElement>(null)

  useEffect(() => { loadSessions(); loadGroups(); loadGroupsTree() }, [])

  // 点击外部关闭右键菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
    }
    if (contextMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [contextMenu])

  // 键盘快捷键：Ctrl+A 全选，Escape 取消选择/关闭对话框
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 检查是否在输入框中，如果是则不拦截快捷键
      const target = e.target as HTMLElement
      const isInputFocused = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable

      if (e.key === 'Escape') {
        // 输入框中的 Escape 不拦截（如清除搜索框）
        if (isInputFocused) return
        // 优先关闭对话框
        if (show) {
          e.preventDefault()
          e.stopPropagation()
          setShow(false)
          return
        }
        if (showGroups) {
          e.preventDefault()
          e.stopPropagation()
          setShowGroups(false)
          return
        }
        if (showCommands) {
          e.preventDefault()
          e.stopPropagation()
          setShowCommands(false)
          return
        }
        if (showQuickConnect) {
          e.preventDefault()
          e.stopPropagation()
          setShowQuickConnect(false)
          return
        }
        // 其次取消多选状态
        if (selectedSessions.size > 0) {
          clearSelection()
        }
        setShowBatchGroupMenu(false)
      }
      // Cmd+A 全选会话：仅在非输入框焦点时生效
      if ((e.ctrlKey || e.metaKey) && e.key === 'a' && !isInputFocused && selectedSessions.size > 0) {
        e.preventDefault()
        selectAll()
      }
    }
    document.addEventListener('keydown', handleKeyDown, true) // 使用 capture 模式
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [selectedSessions, sessions, show, showGroups, showCommands, showQuickConnect])

  // 点击外部关闭批量分组菜单
  useEffect(() => {
    if (!showBatchGroupMenu) return
    const handleClick = () => setShowBatchGroupMenu(false)
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [showBatchGroupMenu])

  // 宽度拖拽调整
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
  }, [])

  useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = e.clientX
      if (newWidth >= 180 && newWidth <= 600) {
        setSidebarWidth(newWidth)
      }
    }

    const handleMouseUp = () => {
      setIsResizing(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing, setSidebarWidth])

  // 对话框拖拽处理
  useEffect(() => {
    if (!isDraggingDialog) return
    const handleMouseMove = (e: MouseEvent) => {
      // 限制对话框位置，确保头部至少有一部分在屏幕内（可拖拽回来）
      const dialogWidth = 480
      const minX = -dialogWidth + 100  // 至少保留100px在屏幕内
      const maxX = window.innerWidth - 100
      const minY = 0
      const maxY = window.innerHeight - 100

      setDialogPosition({
        x: Math.max(minX, Math.min(maxX, e.clientX - dragOffset.current.x)),
        y: Math.max(minY, Math.min(maxY, e.clientY - dragOffset.current.y)),
      })
    }
    const handleMouseUp = () => setIsDraggingDialog(false)
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDraggingDialog])

  const handleDialogMouseDown = (e: React.MouseEvent) => {
    dragOffset.current = {
      x: e.clientX - dialogPosition.x,
      y: e.clientY - dialogPosition.y,
    }
    setIsDraggingDialog(true)
  }

  // 自动隐藏模式下的悬浮显示
  const isVisible = sidebar.mode === 'auto-hide' ? isHovered : true

  const handleNew = async () => {
    setIsNew(true)
    setEdit({
      name: '',
      protocol: 'ssh',
      host: '',
      port: 22,
      user: '',
      authType: 'password',
      password: '',
      keyPath: '',
      group: '',
      description: '',
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      // 个性化设置默认值
      useCustomSettings: false,
      templateId: '',
      fontSize: 14,
      fontFamily: '',
      themeId: '',
      backgroundOpacity: 50,
      backgroundBlur: 0,
      backgroundImage: '',
      scrollback: 10000,
      cursorStyle: 'block',
      cursorBlink: true,
      lineHeight: 1.2,
      letterSpacing: 0,
    })
    setErr('')
    setShow(true)
  }

  const handleEdit = (s: Session) => {
    setIsNew(false)
    setEdit({ ...s })
    setErr('')
    setShow(true)
  }

  const handleDelete = async (s: Session) => {
    const confirmed = await confirmDialog(t('common.confirm'), t('confirm.deleteSession').replace('{name}', s.name))
    if (confirmed) {
      await deleteSession(s.id)
    }
  }

  const handleClone = async (s: Session) => {
    try {
      await cloneSession(s.id)
    } catch (e) {
      alert(t('common.clone') + ' ' + t('status.error') + ': ' + e)
    }
  }

  const handleContextMenu = (e: React.MouseEvent, s: Session) => {
    e.preventDefault()
    e.stopPropagation()
    const x = Math.min(e.clientX, window.innerWidth - 200)
    const y = Math.min(e.clientY, window.innerHeight - 200)

    // 如果右键点击的会话不在已选中列表中，清除多选并只选中当前
    if (!selectedSessions.has(s.id)) {
      setSelectedSessions(new Set([s.id]))
      setLastClickedId(s.id)
    }

    setContextMenu({ x, y, session: s, groupMenuMode: null })
  }

  // 多选处理
  const handleSessionClick = (e: React.MouseEvent, s: Session) => {
    setContextMenu(null)

    // 获取当前显示顺序的会话列表
    const visibleSessions = getVisibleSessionsInOrder()
    const currentIndex = visibleSessions.findIndex(sess => sess.id === s.id)

    if (e.ctrlKey || e.metaKey) {
      // Ctrl/Cmd + 点击：切换选中状态
      setSelectedSessions(prev => {
        const next = new Set(prev)
        if (next.has(s.id)) {
          next.delete(s.id)
        } else {
          next.add(s.id)
        }
        return next
      })
      setLastClickedId(s.id)
      setLastClickedIndex(currentIndex)
    } else if (e.shiftKey && lastClickedId !== null && lastClickedIndex !== null) {
      // Shift + 点击：范围选择（使用显示顺序）
      if (currentIndex !== -1 && lastClickedIndex !== -1) {
        const start = Math.min(currentIndex, lastClickedIndex)
        const end = Math.max(currentIndex, lastClickedIndex)
        const idsToSelect = visibleSessions.slice(start, end + 1).map(sess => sess.id)
        setSelectedSessions(new Set(idsToSelect))
      }
    } else {
      // 普通点击：只选中当前（不连接）
      setSelectedSessions(new Set([s.id]))
      setLastClickedId(s.id)
      setLastClickedIndex(currentIndex)
      // 单击只选中，双击才连接
    }
  }

  // 清除选择
  const clearSelection = () => {
    setSelectedSessions(new Set())
    setLastClickedId(null)
    setLastClickedIndex(null)
  }

  // 全选（仅选择当前可见的会话）
  const selectAll = () => {
    const visibleSessions = getVisibleSessionsInOrder()
    setSelectedSessions(new Set(visibleSessions.map(s => s.id)))
  }

  // 批量移动到分组
  const handleBatchMoveToGroup = async (groupName: string) => {
    if (selectedSessions.size === 0) return
    const confirmed = await confirmDialog(
      t('common.confirm'),
      t('confirm.moveSessions').replace('{count}', String(selectedSessions.size)).replace('{group}', groupName || t('batch.ungrouped'))
    )
    if (!confirmed) return

    for (const id of selectedSessions) {
      const session = sessions.find(s => s.id === id)
      if (session) {
        await updateSession({ ...session, group: groupName })
      }
    }
    clearSelection()
    setShowBatchGroupMenu(false)
  }

  // 批量删除
  const handleBatchDelete = async () => {
    if (selectedSessions.size === 0) return
    const confirmed = await confirmDialog(
      t('common.confirm'),
      t('confirm.deleteSessions').replace('{count}', String(selectedSessions.size))
    )
    if (!confirmed) return

    for (const id of selectedSessions) {
      await deleteSession(id)
    }
    clearSelection()
  }

  const handleMoveToGroup = async (groupName: string) => {
    if (!contextMenu) return
    await updateSession({ ...contextMenu.session, group: groupName })
    setContextMenu(null)
  }

  const handleCopyToGroup = async (groupName: string) => {
    if (!contextMenu) return
    try {
      const cloned = await cloneSession(contextMenu.session.id)
      await updateSession({ ...cloned, name: cloned.name + ' (副本)', group: groupName })
    } catch (e) {
      alert(t('common.clone') + ' ' + t('status.error') + ': ' + e)
    }
    setContextMenu(null)
  }

  const handleSave = async () => {
    if (!edit.name?.trim()) { setErr('请输入名称'); return }
    if (edit.protocol === 'serial') {
      if (!edit.host?.trim()) { setErr('请输入串口路径'); return }
    } else if (edit.protocol === 'ssh') {
      if (!edit.host?.trim()) { setErr('请输入主机'); return }
      if (!edit.user?.trim()) { setErr('请输入用户名'); return }
    } else if (edit.protocol === 'telnet') {
      if (!edit.host?.trim()) { setErr('请输入主机'); return }
    } else if (edit.protocol === 'local') {
      if (!edit.host?.trim()) { setErr(t('quickConnect.errLocalShellRequired')); return }
    }
    setSaving(true)
    setErr('')
    try {
      if (isNew) {
        await createSession(edit)
      } else {
        await updateSession(edit as Session)
      }
      setShow(false)
    } catch (e) {
      setErr(String(e))
    } finally {
      setSaving(false)
    }
  }

  const getStatusColor = (id: string) => {
    const s = getSessionStatus(id)
    return s === 'connected' ? 'bg-green-500' : s === 'connecting' ? 'bg-yellow-500' : s === 'error' ? 'bg-red-500' : 'bg-gray-500'
  }

  // 获取协议图标
  const getProtocolIcon = (protocol: string) => {
    switch (protocol) {
      case 'ssh':
        return <Key size={14} className="text-accent-green" />
      case 'telnet':
        return <Globe size={14} className="text-accent-yellow" />
      case 'serial':
        return <Cpu size={14} className="text-accent-blue" />
      default:
        return <Server size={14} className="text-text-secondary" />
    }
  }

  // 获取协议徽章样式
  const getProtocolBadgeClass = (protocol: string) => {
    switch (protocol) {
      case 'ssh':
        return 'bg-green-500/20 text-green-400'
      case 'telnet':
        return 'bg-yellow-500/20 text-yellow-400'
      case 'serial':
        return 'bg-blue-500/20 text-blue-400'
      default:
        return 'bg-surface-2 text-text-muted'
    }
  }

  // 获取认证类型徽章样式
  const getAuthTypeBadgeClass = (authType: string) => {
    switch (authType) {
      case 'password':
        return 'bg-purple-500/20 text-purple-400'
      case 'key':
        return 'bg-cyan-500/20 text-cyan-400'
      default:
        return 'bg-surface-2 text-text-muted'
    }
  }

  // 获取认证类型显示文本
  const getAuthTypeText = (authType: string) => {
    switch (authType) {
      case 'password':
        return t('session.password')
      case 'key':
        return t('session.publicKey')
      default:
        return authType
    }
  }

  // 自动隐藏模式下的触发区域
  if (sidebar.mode === 'auto-hide' && !isHovered) {
    return (
      <div
        className="w-2 h-full bg-surface-1 border-r border-surface-2 hover:w-3 transition-all cursor-pointer"
        onMouseEnter={() => setIsHovered(true)}
      />
    )
  }

  // 展开/折叠分组
  const toggleGroupExpand = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(groupId)) {
        next.delete(groupId)
      } else {
        next.add(groupId)
      }
      return next
    })
  }

  // 全部展开
  const expandAllGroups = () => {
    const allIds = new Set<string>()
    // 添加所有分组ID
    groups.forEach(g => allIds.add(g.id))
    // 添加分组树中的所有分组
    groupsTree.forEach(node => {
      const collectIds = (n: GroupNode) => {
        allIds.add(n.group.id)
        n.children?.forEach(collectIds)
      }
      collectIds(node)
    })
    // 添加未分组
    allIds.add('ungrouped')
    setExpandedGroups(allIds)
  }

  // 全部折叠
  const collapseAllGroups = () => {
    setExpandedGroups(new Set())
  }

  // 未分组ID（用于折叠状态管理）
  const ungroupedId = 'ungrouped'
  const isUngroupedExpanded = expandedGroups.has(ungroupedId)

  // 获取分组中的会话（使用 path 匹配）
  const getSessionsByPath = (path: string): Session[] => {
    return sessions.filter(s => s.group === path)
  }

  // 递归计算分组及其子分组下的所有会话数量
  const getTotalSessionCount = (node: GroupNode): number => {
    const directSessions = getSessionsByPath(node.group.path).length
    let childSessions = 0
    if (node.children) {
      for (const child of node.children) {
        childSessions += getTotalSessionCount(child)
      }
    }
    return directSessions + childSessions
  }

  // 获取按 UI 显示顺序排列的可见会话列表（考虑分组展开状态）
  const getVisibleSessionsInOrder = useCallback((): Session[] => {
    const orderedSessions: Session[] = []
    const ungroupedId = 'ungrouped'

    // 递归收集展开分组下的会话
    const collectSessionsFromNode = (node: GroupNode) => {
      // 如果分组展开，添加直接会话
      if (expandedGroups.has(node.group.id)) {
        orderedSessions.push(...getSessionsByPath(node.group.path))
        // 继续处理子分组
        if (node.children) {
          for (const child of node.children) {
            collectSessionsFromNode(child)
          }
        }
      }
    }

    // 按分组树顺序收集
    for (const node of groupsTree) {
      collectSessionsFromNode(node)
    }

    // 添加未分组会话（如果展开）
    if (expandedGroups.has(ungroupedId)) {
      orderedSessions.push(...sessions.filter(s => !s.group || s.group === ''))
    }

    return orderedSessions
  }, [sessions, groupsTree, expandedGroups])

  // 递归渲染树形分组
  const renderGroupNode = (node: GroupNode, depth: number = 0): React.ReactNode => {
    const g = node.group
    const hasChildren = node.children && node.children.length > 0
    const isExpanded = expandedGroups.has(g.id)
    const directSessions = getSessionsByPath(g.path)
    const totalSessions = getTotalSessionCount(node)
    const indent = depth * 16

    return (
      <div key={g.id}>
        {/* 分组标题 */}
        <div
          className="px-3 py-2 text-xs text-text-secondary font-semibold flex items-center gap-1 cursor-pointer hover:bg-surface-2/50 select-none"
          style={{ paddingLeft: `${12 + indent}px` }}
          onClick={() => toggleGroupExpand(g.id)}
        >
          <span className="text-text-muted">
            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </span>
          <Folder size={14} className={isExpanded ? 'text-accent-blue' : 'text-text-muted'} />
          <span className="text-text-primary">{g.name}</span>
          <span className="text-text-muted ml-auto">{totalSessions}</span>
        </div>
        {/* 会话列表和子分组（仅在展开时显示） */}
        {isExpanded && (
          <>
            {/* 直接会话 */}
            {directSessions.map(s => {
              const isSelected = selectedSessions.has(s.id)
              return (
                <div
                  key={s.id}
                  className={`sidebar-item group ${isSelected ? 'bg-accent-blue/30 border-l-4 border-accent-blue' : ''}`}
                  style={{ paddingLeft: `${28 + indent}px` }}
                  onClick={(e) => handleSessionClick(e, s)}
                  onDoubleClick={() => {
                    if (selectedSessions.size <= 1) {
                      onDoubleClickSession?.(s.id)
                    }
                  }}
                  onContextMenu={(e) => handleContextMenu(e, s)}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${getStatusColor(s.id)}`} />
                    <span className="text-sm text-text-primary truncate">{s.name}</span>
                    {sidebarTagSettings.showProtocol && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium uppercase ${getProtocolBadgeClass(s.protocol)}`}>
                        {s.protocol}
                      </span>
                    )}
                    {sidebarTagSettings.showAuthType && s.protocol === 'ssh' && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${getAuthTypeBadgeClass(s.authType || 'password')}`}>
                        {getAuthTypeText(s.authType || 'password')}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-0.5 flex-shrink-0 opacity-40 group-hover:opacity-100 transition-opacity">
                    <button onClick={e => { e.stopPropagation(); handleClone(s) }} className="p-1 hover:text-accent-green text-text-muted" title="克隆"><Copy size={14} /></button>
                    <button onClick={e => { e.stopPropagation(); handleEdit(s) }} className="p-1 hover:text-accent-blue text-text-muted" title="编辑"><Edit3 size={14} /></button>
                    <button onClick={e => { e.stopPropagation(); handleDelete(s) }} className="p-1 hover:text-accent-red text-text-muted" title="删除"><Trash2 size={14} /></button>
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

  return (
    <div
      ref={sidebarRef}
      className={`bg-surface-1 border-r border-surface-2 flex flex-col relative ${sidebar.mode === 'auto-hide' ? 'absolute left-0 top-0 h-full z-50' : ''}`}
      style={{ width: sidebar.width }}
      onMouseLeave={() => sidebar.mode === 'auto-hide' && setIsHovered(false)}
    >
      {/* 宽度调整手柄 */}
      <div
        ref={resizeRef}
        className={`absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:w-1.5 hover:bg-accent-blue/30 transition-all ${isResizing ? 'bg-accent-blue/50 w-1.5' : ''}`}
        onMouseDown={handleMouseDown}
      />

      {/* 标题栏 */}
      <div className="p-3 flex items-center justify-between border-b border-surface-2">
        <span className="font-semibold text-text-primary">{t('sidebar.sessions')}</span>
        <div className="flex items-center gap-1">
          {sidebar.mode === 'always-show' && (
            <span className="flex items-center" title={t('sidebar.alwaysShow')}>
              <Pin size={12} className="text-accent-blue" />
            </span>
          )}
          {/* 模式切换菜单 */}
          <div className="relative">
            <button
              onClick={() => setShowModeMenu(!showModeMenu)}
              className="p-1 hover:bg-surface-2 rounded text-text-secondary"
              title={t('sidebar.settings')}
            >
              <Settings size={14} />
            </button>
            {showModeMenu && (
              <div className="absolute right-0 top-full mt-1 bg-surface-1 border border-surface-2 rounded-lg shadow-xl py-1 min-w-[140px] z-50">
                <div className="px-2 py-1 text-xs text-text-muted border-b border-surface-2">{t('sidebar.mode')}</div>
                {[
                  { mode: 'always-show' as SidebarMode, label: t('sidebar.alwaysShow'), icon: <Pin size={12} /> },
                  { mode: 'auto-hide' as SidebarMode, label: t('sidebar.autoHide'), icon: <PanelLeftClose size={12} /> },
                ].map(item => (
                  <div
                    key={item.mode}
                    className={`px-3 py-2 text-sm text-text-primary hover:bg-surface-2 flex items-center gap-2 cursor-pointer ${sidebar.mode === item.mode ? 'bg-surface-2' : ''}`}
                    onClick={() => { setSidebarMode(item.mode); setShowModeMenu(false); }}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 拖拽提示 */}
      <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 flex flex-col items-center justify-center gap-1 opacity-0 hover:opacity-100 transition-opacity pointer-events-none">
        <GripVertical size={10} className="text-text-muted" />
      </div>

      {/* 搜索框 */}
      <div className="p-2">
        <input value={kw} onChange={e => { setKw(e.target.value); searchSessions(e.target.value) }} placeholder={t('sidebar.searchPlaceholder')} className="input-field text-sm" />
      </div>

      {/* 分组展开/折叠工具栏 */}
      {(groupsTree.length > 0 || ungroupedSessions.length > 0) && (
        <div className="px-2 py-1 flex items-center gap-1 border-b border-surface-2">
          <button
            onClick={expandAllGroups}
            className="flex items-center gap-1 px-2 py-1 text-xs text-text-muted hover:text-text-primary hover:bg-surface-2 rounded transition-colors"
            title={t('sidebar.expandAll')}
          >
            <ListTree size={14} />
            <span>{t('sidebar.expandAll')}</span>
          </button>
          <button
            onClick={collapseAllGroups}
            className="flex items-center gap-1 px-2 py-1 text-xs text-text-muted hover:text-text-primary hover:bg-surface-2 rounded transition-colors"
            title={t('sidebar.collapseAll')}
          >
            <ListMinus size={14} />
            <span>{t('sidebar.collapseAll')}</span>
          </button>
        </div>
      )}

      {/* 多选工具栏 */}
      {selectedSessions.size > 1 && (
        <div className="px-2 py-1.5 bg-surface-2 border-b border-surface-3 flex items-center gap-2">
          <span className="text-xs text-text-secondary flex-1">
            {t('batch.selected').replace('{count}', String(selectedSessions.size))}
          </span>
          <button
            onClick={selectAll}
            className="text-xs text-accent-blue hover:underline"
          >
            {t('batch.selectAll')}
          </button>
          <button
            onClick={clearSelection}
            className="text-xs text-text-muted hover:text-text-primary"
          >
            {t('batch.cancel')}
          </button>
        </div>
      )}

      {/* 会话列表 */}
      <div className="flex-1 overflow-y-auto">
        {loading ? <div className="p-4 text-center text-text-muted">{t('sidebar.loading')}</div> :
         !sessions.length && !groups.length ? <div className="p-4 text-center text-text-muted"><p>{t('sidebar.noSessions')}</p><p className="text-sm mt-1">{t('sidebar.noSessionsTip')}</p></div> :
         <>
          {/* 树形分组显示 */}
          {groupsTree.map(node => renderGroupNode(node))}
          {/* 未分组的会话 */}
          {ungroupedSessions.length > 0 && (
            <div>
              {/* 未分组标题（可折叠） */}
              <div
                className="px-3 py-2 text-xs text-text-secondary font-semibold flex items-center gap-1 cursor-pointer hover:bg-surface-2/50 select-none"
                onClick={() => toggleGroupExpand(ungroupedId)}
              >
                <span className="text-text-muted">
                  {isUngroupedExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </span>
                <Folder size={14} className={isUngroupedExpanded ? 'text-text-muted' : 'text-text-muted'} />
                <span className="text-text-primary">{t('sidebar.noGroups')}</span>
                <span className="text-text-muted ml-auto">{ungroupedSessions.length}</span>
              </div>
              {/* 会话列表（仅展开时显示） */}
              {isUngroupedExpanded && ungroupedSessions.map(s => {
                const isSelected = selectedSessions.has(s.id)
                return (
                  <div
                    key={s.id}
                    className={`sidebar-item group ${isSelected ? 'bg-accent-blue/30 border-l-4 border-accent-blue pl-2' : ''}`}
                    onClick={(e) => handleSessionClick(e, s)}
                    onDoubleClick={() => {
                      if (selectedSessions.size <= 1) {
                        onDoubleClickSession?.(s.id)
                      }
                    }}
                    onContextMenu={(e) => handleContextMenu(e, s)}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${getStatusColor(s.id)}`} />
                      <span className="text-sm text-text-primary truncate">{s.name}</span>
                      {sidebarTagSettings.showProtocol && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium uppercase ${getProtocolBadgeClass(s.protocol)}`}>
                          {s.protocol}
                        </span>
                      )}
                      {sidebarTagSettings.showAuthType && s.protocol === 'ssh' && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${getAuthTypeBadgeClass(s.authType || 'password')}`}>
                          {getAuthTypeText(s.authType || 'password')}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-0.5 flex-shrink-0 opacity-40 group-hover:opacity-100 transition-opacity">
                      <button onClick={e => { e.stopPropagation(); handleClone(s) }} className="p-1 hover:text-accent-green text-text-muted" title="克隆"><Copy size={14} /></button>
                      <button onClick={e => { e.stopPropagation(); handleEdit(s) }} className="p-1 hover:text-accent-blue text-text-muted" title="编辑"><Edit3 size={14} /></button>
                      <button onClick={e => { e.stopPropagation(); handleDelete(s) }} className="p-1 hover:text-accent-red text-text-muted" title="删除"><Trash2 size={14} /></button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
         </>}
      </div>

      {/* 底部操作栏 */}
      <div className="p-2 border-t border-surface-2 space-y-1">
        {/* 批量操作（多选时显示） */}
        {selectedSessions.size > 1 && (
          <div className="flex gap-1 pb-1 border-b border-surface-2 mb-1">
            <div className="relative flex-1">
              <button
                onClick={e => { e.stopPropagation(); setShowBatchGroupMenu(!showBatchGroupMenu) }}
                className="sidebar-item text-sm w-full justify-center bg-surface-2"
              >
                <MoveRight size={14} />
                <span>{t('batch.moveToGroup')}</span>
              </button>
              {showBatchGroupMenu && (
                <div
                  className="absolute bottom-full left-0 mb-1 bg-surface-1 border border-surface-2 rounded-lg shadow-xl py-1 min-w-[120px] z-50"
                  onClick={e => e.stopPropagation()}
                >
                  <div
                    className="px-3 py-2 text-sm text-text-primary hover:bg-surface-2 cursor-pointer"
                    onMouseDown={e => e.stopPropagation()}
                    onClick={() => handleBatchMoveToGroup('')}
                  >
                    {t('batch.ungrouped')}
                  </div>
                  {groups.map(g => (
                    <div
                      key={g.id}
                      className="px-3 py-2 text-sm text-text-primary hover:bg-surface-2 cursor-pointer"
                      onMouseDown={e => e.stopPropagation()}
                      onClick={() => handleBatchMoveToGroup(g.path)}
                    >
                      {g.path}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={handleBatchDelete}
              className="sidebar-item text-sm flex-1 justify-center bg-surface-2 hover:bg-red-500/20 hover:text-accent-red"
            >
              <Trash2 size={14} />
              <span>{t('batch.delete')}</span>
            </button>
          </div>
        )}
        <button onClick={() => setShowQuickConnect(true)} className="sidebar-item text-sm"><Zap size={16} /><span>{t('sidebar.quickConnect')}</span></button>
        <button onClick={handleNew} className="sidebar-item text-sm"><Plus size={16} /><span>{t('sidebar.newSession')}</span></button>
        <button onClick={() => setShowGroups(true)} className="sidebar-item text-sm"><FolderPlus size={16} /><span>{t('sidebar.groupManage')}</span></button>
        <button onClick={() => setShowCommands(true)} className="sidebar-item text-sm"><Terminal size={16} /><span>{t('sidebar.commandLibrary')}</span></button>
        <button onClick={onOpenSettings} className="sidebar-item text-sm"><Settings size={16} /><span>{t('sidebar.settings')}</span></button>
      </div>

      {/* 会话编辑对话框 */}
      {show && (
        <div className="dialog-panel flex flex-col"
          style={{
            position: 'fixed',
            left: dialogPosition.x,
            top: dialogPosition.y,
            width: 480,
            maxHeight: '85vh',
            zIndex: 1000,
            cursor: isDraggingDialog ? 'grabbing' : 'default',
          }}
        >
          {/* 拖拽标题栏 */}
          <div
            className="p-4 border-b border-surface-2 flex items-center justify-between"
            onMouseDown={handleDialogMouseDown}
            style={{ cursor: 'grab', userSelect: 'none' }}
          >
            <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2">
              {isNew ? <Plus size={20} /> : <Edit3 size={20} />}
              {isNew ? t('sidebar.newSession') : t('sidebar.editSession')}
            </h3>
            <button
              onClick={() => setShow(false)}
              className="p-1 hover:bg-surface-2 rounded text-text-muted"
              style={{ cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>
          <div className="p-4 overflow-y-auto flex-1">
            {err && <div className="mb-4 p-3 bg-red-900/30 border border-red-700/50 rounded-lg text-red-400 text-sm">{err}</div>}
            <div className="space-y-4">
            <div><label className="block text-sm text-text-secondary mb-1">{t('common.name')} *</label><input value={edit.name || ''} onChange={e => setEdit({ ...edit, name: e.target.value })} className="input-field" autoFocus /></div>
            <div><label className="block text-sm text-text-secondary mb-1">{t('common.protocol')}</label><select value={edit.protocol || 'ssh'} onChange={e => setEdit({ ...edit, protocol: e.target.value as Session['protocol'] })} className="input-field"><option value="ssh">SSH</option><option value="telnet">Telnet</option><option value="serial">Serial</option><option value="local">{t('quickConnect.local')}</option></select></div>
            {edit.protocol === 'serial' ? (
              <>
                <div><label className="block text-sm text-text-secondary mb-1">{t('session.serialPath')} *</label><input value={edit.host || ''} onChange={e => setEdit({ ...edit, host: e.target.value })} placeholder="/dev/ttyUSB0 / COM1" className="input-field" /></div>
                <div><label className="block text-sm text-text-secondary mb-1">{t('session.baudRate')}</label><select value={edit.port || 9600} onChange={e => setEdit({ ...edit, port: +e.target.value })} className="input-field"><option value="9600">9600</option><option value="19200">19200</option><option value="38400">38400</option><option value="57600">57600</option><option value="115200">115200</option></select></div>
                <div className="grid grid-cols-3 gap-3">
                  <div><label className="block text-sm text-text-secondary mb-1">{t('session.dataBits')}</label><select value={edit.dataBits || 8} onChange={e => setEdit({ ...edit, dataBits: +e.target.value })} className="input-field"><option value="5">5</option><option value="6">6</option><option value="7">7</option><option value="8">8</option></select></div>
                  <div><label className="block text-sm text-text-secondary mb-1">{t('session.stopBits')}</label><select value={edit.stopBits || 1} onChange={e => setEdit({ ...edit, stopBits: +e.target.value })} className="input-field"><option value="1">1</option><option value="2">2</option></select></div>
                  <div><label className="block text-sm text-text-secondary mb-1">{t('session.parity')}</label><select value={edit.parity || 'none'} onChange={e => setEdit({ ...edit, parity: e.target.value as 'none' | 'even' | 'odd' })} className="input-field"><option value="none">None</option><option value="even">Even</option><option value="odd">Odd</option></select></div>
                </div>
              </>
            ) : edit.protocol === 'ssh' || edit.protocol === 'telnet' ? (
              <>
                <div className="grid grid-cols-3 gap-3"><div className="col-span-2"><label className="block text-sm text-text-secondary mb-1">{t('common.host')} *</label><input value={edit.host || ''} onChange={e => setEdit({ ...edit, host: e.target.value })} className="input-field" /></div><div><label className="block text-sm text-text-secondary mb-1">{t('common.port')}</label><input type="number" value={edit.port || (edit.protocol === 'telnet' ? 23 : 22)} onChange={e => setEdit({ ...edit, port: +e.target.value || (edit.protocol === 'telnet' ? 23 : 22) })} className="input-field" /></div></div>
                {edit.protocol === 'ssh' && (
                  <>
                    <div><label className="block text-sm text-text-secondary mb-1">{t('session.username')} *</label><input value={edit.user || ''} onChange={e => setEdit({ ...edit, user: e.target.value })} className="input-field" /></div>
                    <div><label className="block text-sm text-text-secondary mb-1">{t('session.authType')}</label><select value={edit.authType || 'password'} onChange={e => setEdit({ ...edit, authType: e.target.value as Session['authType'] })} className="input-field"><option value="password">{t('session.password')}</option><option value="key">{t('session.publicKey')}</option></select></div>
                    {edit.authType === 'password' && <div><label className="block text-sm text-text-secondary mb-1">{t('session.password')}</label><input type="password" value={edit.password || ''} onChange={e => setEdit({ ...edit, password: e.target.value })} className="input-field" /></div>}
                    {edit.authType === 'key' && (
                      <>
                        <div><label className="block text-sm text-text-secondary mb-1">{t('session.keyPath')}</label><input value={edit.keyPath || ''} onChange={e => setEdit({ ...edit, keyPath: e.target.value })} placeholder="~/.ssh/id_rsa" className="input-field" /></div>
                        <div><label className="block text-sm text-text-secondary mb-1">{t('session.keyPassphrase')}</label><input type="password" value={edit.keyPassphrase || ''} onChange={e => setEdit({ ...edit, keyPassphrase: e.target.value })} placeholder={t('session.optional')} className="input-field" /></div>
                      </>
                    )}
                  </>
                )}
                {edit.protocol === 'telnet' && (
                  <>
                    <div className="p-2 bg-surface-2 rounded text-xs text-text-muted mb-2">{t('session.telnetLoginHint')}</div>
                    <div><label className="block text-sm text-text-secondary mb-1">{t('session.username')}</label><input value={edit.user || ''} onChange={e => setEdit({ ...edit, user: e.target.value })} placeholder={t('session.optional')} className="input-field" /></div>
                    <div><label className="block text-sm text-text-secondary mb-1">{t('session.password')}</label><input type="password" value={edit.password || ''} onChange={e => setEdit({ ...edit, password: e.target.value })} placeholder={t('session.optional')} className="input-field" /></div>
                    <div className="flex items-center gap-2 mt-2">
                      <input type="checkbox" id="noNegotiation" checked={edit.noNegotiation || false} onChange={e => setEdit({ ...edit, noNegotiation: e.target.checked })} className="w-4 h-4" />
                      <label htmlFor="noNegotiation" className="text-sm text-text-secondary cursor-pointer">{t('session.noNegotiation')}</label>
                    </div>
                    <p className="text-xs text-text-muted mt-1">{t('session.noNegotiationHint')}</p>
                  </>
                )}
              </>
            ) : (
              // local 协议：显示 Shell 类型和工作目录配置
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-text-secondary mb-1">{t('quickConnect.localShell')}</label>
                  <select value={edit.host || ''} onChange={e => setEdit({ ...edit, host: e.target.value })} className="input-field">
                    <option value="">{t('quickConnect.selectShell')}</option>
                    <option value="bash">Bash</option>
                    <option value="zsh">Zsh</option>
                    <option value="fish">Fish</option>
                    <option value="/bin/sh">Sh</option>
                    <option value="cmd">CMD (Windows)</option>
                    <option value="powershell">PowerShell (Windows)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-text-secondary mb-1">{t('quickConnect.workingDir')}</label>
                  <input value={edit.user || ''} onChange={e => setEdit({ ...edit, user: e.target.value })} placeholder={t('quickConnect.workingDirPlaceholder')} className="input-field" />
                </div>
              </div>
            )}
            <div>
              <label className="block text-sm text-text-secondary mb-1">{t('session.group')}</label>
              <select value={edit.group || ''} onChange={e => setEdit({ ...edit, group: e.target.value })} className="input-field">
                <option value="">{t('sidebar.noGroup')}</option>
                {groups.map(g => <option key={g.id} value={g.path}>{g.path}</option>)}
              </select>
            </div>
            <div><label className="block text-sm text-text-secondary mb-1">{t('session.description')}</label><textarea value={edit.description || ''} onChange={e => setEdit({ ...edit, description: e.target.value })} rows={2} className="input-field resize-none" /></div>
            <div>
              <label className="block text-sm text-text-secondary mb-1">{t('session.loginScript')}</label>
              <textarea
                value={(edit.loginScript || []).join('\n')}
                onChange={e => setEdit({ ...edit, loginScript: e.target.value.split('\n').filter(s => s.trim()) })}
                rows={3}
                className="input-field resize-none"
                placeholder={t('session.loginScriptPlaceholder')}
              />
              <p className="text-xs text-text-muted mt-1">{t('session.loginScriptHint')}</p>
            </div>
            </div>
          </div>
          <div className="p-4 border-t border-surface-2 flex justify-end gap-3">
            <button onClick={() => setShow(false)} className="btn btn-secondary" disabled={saving}>{t('common.cancel')}</button>
            <button onClick={handleSave} className="btn btn-primary" disabled={saving}>{saving ? t('sidebar.saving') : t('common.save')}</button>
          </div>
        </div>
      )}

      {/* 右键菜单 */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed bg-surface-1 border border-surface-2 rounded-lg shadow-xl py-1 z-[9999] min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {/* 多选状态显示批量操作 */}
          {selectedSessions.size > 1 ? (
            <>
              <div className="px-3 py-2 text-xs text-text-muted border-b border-surface-2">
                {t('batch.selected').replace('{count}', String(selectedSessions.size))}
              </div>
              <div className="relative">
                <div
                  className="w-full px-3 py-2 text-sm text-text-primary hover:bg-surface-2 flex items-center justify-between cursor-pointer"
                  onMouseEnter={() => setContextMenu(prev => prev ? { ...prev, groupMenuMode: 'move' } : null)}
                >
                  <div className="flex items-center gap-2">
                    <MoveRight size={14} /> {t('batch.moveToGroup')}
                  </div>
                  <ChevronRight size={14} />
                </div>
                {contextMenu.groupMenuMode === 'move' && (
                  <div
                    className="absolute left-full top-0 bg-surface-1 border border-surface-2 rounded-lg shadow-xl py-1 min-w-[120px]"
                    onMouseLeave={() => setContextMenu(prev => prev ? { ...prev, groupMenuMode: null } : null)}
                  >
                    <div
                      className="px-3 py-2 text-sm text-text-primary hover:bg-surface-2 cursor-pointer"
                      onClick={() => { handleBatchMoveToGroup(''); setContextMenu(null); }}
                    >
                      {t('batch.ungrouped')}
                    </div>
                    {groups.map(g => (
                      <div
                        key={g.id}
                        className="px-3 py-2 text-sm text-text-primary hover:bg-surface-2 cursor-pointer"
                        onClick={() => { handleBatchMoveToGroup(g.path); setContextMenu(null); }}
                      >
                        {g.path}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="border-t border-surface-2 my-1" />
              <div
                className="w-full px-3 py-2 text-sm text-accent-red hover:bg-surface-2 flex items-center gap-2 cursor-pointer"
                onClick={() => { handleBatchDelete(); setContextMenu(null); }}
              >
                <Trash2 size={14} /> {t('batch.delete')}
              </div>
            </>
          ) : (
            <>
              <div
                className="w-full px-3 py-2 text-sm text-text-primary hover:bg-surface-2 flex items-center gap-2 cursor-pointer"
                onClick={() => { handleEdit(contextMenu.session); setContextMenu(null); }}
              >
                <Edit3 size={14} /> {t('common.edit')}
              </div>
              <div
                className="w-full px-3 py-2 text-sm text-text-primary hover:bg-surface-2 flex items-center gap-2 cursor-pointer"
                onClick={() => { handleClone(contextMenu.session); setContextMenu(null); }}
              >
                <Copy size={14} /> {t('common.clone')}
              </div>

              <div className="relative">
                <div
                  className="w-full px-3 py-2 text-sm text-text-primary hover:bg-surface-2 flex items-center justify-between cursor-pointer"
                  onMouseEnter={() => setContextMenu(prev => prev ? { ...prev, groupMenuMode: 'move' } : null)}
                >
                  <div className="flex items-center gap-2">
                    <MoveRight size={14} /> {t('sidebar.moveToGroup')}
                  </div>
                  <ChevronRight size={14} />
                </div>
                {contextMenu.groupMenuMode === 'move' && (
                  <div
                    className="absolute left-full top-0 bg-surface-1 border border-surface-2 rounded-lg shadow-xl py-1 min-w-[120px]"
                    onMouseLeave={() => setContextMenu(prev => prev ? { ...prev, groupMenuMode: null } : null)}
                  >
                    <div
                      className="px-3 py-2 text-sm text-text-primary hover:bg-surface-2 cursor-pointer"
                      onClick={() => handleMoveToGroup('')}
                    >
                      {t('sidebar.noGroup')}
                    </div>
                    {groups.map(g => (
                      <div
                        key={g.id}
                        className={`px-3 py-2 text-sm text-text-primary hover:bg-surface-2 cursor-pointer ${contextMenu.session.group === g.path ? 'bg-surface-2' : ''}`}
                        onClick={() => handleMoveToGroup(g.path)}
                      >
                        {g.path}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="relative">
                <div
                  className="w-full px-3 py-2 text-sm text-text-primary hover:bg-surface-2 flex items-center justify-between cursor-pointer"
                  onMouseEnter={() => setContextMenu(prev => prev ? { ...prev, groupMenuMode: 'copy' } : null)}
                >
                  <div className="flex items-center gap-2">
                    <Copy size={14} /> {t('sidebar.copyToGroup')}
                  </div>
                  <ChevronRight size={14} />
                </div>
                {contextMenu.groupMenuMode === 'copy' && (
                  <div
                    className="absolute left-full top-0 bg-surface-1 border border-surface-2 rounded-lg shadow-xl py-1 min-w-[120px]"
                    onMouseLeave={() => setContextMenu(prev => prev ? { ...prev, groupMenuMode: null } : null)}
                  >
                    <div
                      className="px-3 py-2 text-sm text-text-primary hover:bg-surface-2 cursor-pointer"
                      onClick={() => handleCopyToGroup('')}
                    >
                      {t('sidebar.noGroup')}
                    </div>
                    {groups.map(g => (
                      <div
                        key={g.id}
                        className="px-3 py-2 text-sm text-text-primary hover:bg-surface-2 cursor-pointer"
                        onClick={() => handleCopyToGroup(g.path)}
                      >
                        {g.path}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t border-surface-2 my-1" />
              <div
                className="w-full px-3 py-2 text-sm text-accent-red hover:bg-surface-2 flex items-center gap-2 cursor-pointer"
                onClick={() => { handleDelete(contextMenu.session); setContextMenu(null); }}
              >
                <Trash2 size={14} /> {t('common.delete')}
              </div>
            </>
          )}
        </div>
      )}

      {showGroups && <GroupManager onClose={() => setShowGroups(false)} />}
      {showCommands && <CommandPanel onClose={() => setShowCommands(false)} />}
      {showQuickConnect && (
        <QuickConnect
          onClose={() => setShowQuickConnect(false)}
          onConnect={(id) => {
            setShowQuickConnect(false)
            onQuickConnect?.(id)
          }}
        />
      )}
    </div>
  )
}