import { useState, useEffect } from 'react'
import { X, Trash2, Folder, Pencil, Check, ChevronRight, ChevronDown, FolderTree, Plus, FolderPlus } from 'lucide-react'
import { useSessionStore } from '../stores/sessionStore'
import { useLocale } from '../stores/localeStore'
import type { GroupNode, Group } from '../api/wails'

interface Props {
  onClose: () => void
}

export function GroupManager({ onClose }: Props) {
  const { sessions, groups, groupsTree, loadGroups, loadGroupsTree, loadSessions, createGroup, updateGroup, deleteGroup, confirmDialog } = useSessionStore()
  const { t } = useLocale()
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupParentId, setNewGroupParentId] = useState('')
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [editingParentId, setEditingParentId] = useState('')
  const [updating, setUpdating] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  useEffect(() => { loadSessions(); loadGroups(); loadGroupsTree() }, [])

  const toggleExpand = (groupId: string) => {
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

  const handleCreate = async () => {
    if (!newGroupName.trim()) return
    setCreating(true)
    try {
      await createGroup(newGroupName.trim(), newGroupParentId)
      setNewGroupName('')
      setNewGroupParentId('')
      if (newGroupParentId) {
        setExpandedGroups(prev => new Set([...prev, newGroupParentId]))
      }
    } catch (e) {
      alert(t('group.createFailed') + ': ' + e)
    } finally {
      setCreating(false)
    }
  }

  const handleStartEdit = (g: Group) => {
    setEditingId(g.id)
    setEditingName(g.name)
    setEditingParentId(g.parentId)
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditingName('')
    setEditingParentId('')
  }

  const handleSaveEdit = async (id: string) => {
    if (!editingName.trim()) return
    setUpdating(true)
    try {
      await updateGroup(id, editingName.trim(), editingParentId)
      setEditingId(null)
      setEditingName('')
      setEditingParentId('')
    } catch (e) {
      alert(t('group.renameFailed') + ': ' + e)
    } finally {
      setUpdating(false)
    }
  }

  const handleDelete = async (id: string, name: string) => {
    const confirmed = await confirmDialog(t('common.confirm'), t('confirm.deleteGroup').replace('{name}', name))
    if (!confirmed) return
    try {
      await deleteGroup(id)
    } catch (e) {
      alert(t('group.deleteFailed') + ': ' + e)
    }
  }

  const getSessionCount = (groupPath: string) => {
    return sessions.filter((s: any) => s.group === groupPath).length
  }

  const getParentOptions = (excludeId?: string): Group[] => {
    if (!excludeId) return groups
    const excludePaths = groups.filter(g => g.id === excludeId || g.path.startsWith(groups.find(gg => gg.id === excludeId)?.path || '')).map(g => g.id)
    return groups.filter(g => !excludePaths.includes(g.id))
  }

  const renderGroupNode = (node: GroupNode, depth: number = 0): React.ReactNode => {
    const g = node.group
    const hasChildren = node.children && node.children.length > 0
    const isExpanded = expandedGroups.has(g.id)
    const indent = depth * 24
    const isEditing = editingId === g.id

    return (
      <div key={g.id}>
        <div
          className="group flex items-center gap-2 py-2.5 px-3 hover:bg-surface-2/50 transition-colors"
          style={{ paddingLeft: `${16 + indent}px` }}
        >
          {/* 展开/折叠 */}
          <button
            onClick={() => toggleExpand(g.id)}
            className="p-1 -ml-1 hover:bg-surface-3 rounded transition-colors"
          >
            {hasChildren ? (
              isExpanded ?
                <ChevronDown size={14} className="text-text-muted" /> :
                <ChevronRight size={14} className="text-text-muted" />
            ) : (
              <span className="w-3.5" />
            )}
          </button>

          {/* 图标 */}
          <Folder size={16} className={`flex-shrink-0 ${isExpanded ? 'text-accent' : 'text-text-muted'}`} />

          {/* 名称/编辑框 */}
          {isEditing ? (
            <div className="flex-1 flex items-center gap-2">
              <input
                value={editingName}
                onChange={e => setEditingName(e.target.value)}
                className="input-field flex-1 text-sm"
                autoFocus
                onKeyDown={e => {
                  if (e.key === 'Enter') handleSaveEdit(g.id)
                  if (e.key === 'Escape') handleCancelEdit()
                }}
                disabled={updating}
                placeholder={t('group.newName')}
              />
            </div>
          ) : (
            <span className="flex-1 text-sm text-text-primary truncate">{g.name}</span>
          )}

          {/* 会话数 */}
          {!isEditing && (
            <span className="text-xs text-text-muted bg-surface-2 px-2 py-0.5 rounded-full">
              {getSessionCount(g.path)}
            </span>
          )}

          {/* 操作按钮 */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {isEditing ? (
              <>
                <button
                  onClick={() => handleSaveEdit(g.id)}
                  disabled={updating || !editingName.trim()}
                  className="p-1.5 hover:bg-surface-3 rounded text-accent-green transition-colors"
                  title={t('group.save')}
                >
                  <Check size={14} />
                </button>
                <button
                  onClick={handleCancelEdit}
                  className="p-1.5 hover:bg-surface-3 rounded text-text-muted transition-colors"
                  title={t('common.cancel')}
                >
                  <X size={14} />
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => handleStartEdit(g)}
                  className="p-1.5 hover:bg-surface-3 rounded text-text-muted hover:text-text-primary transition-colors"
                  title={t('group.rename')}
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => handleDelete(g.id, g.name)}
                  className="p-1.5 hover:bg-surface-3 rounded text-text-muted hover:text-accent-red transition-colors"
                  title={t('common.delete')}
                >
                  <Trash2 size={14} />
                </button>
              </>
            )}
          </div>
        </div>

        {/* 编辑模式的父分组选择 */}
        {isEditing && (
          <div
            className="flex items-center gap-2 py-2 px-3 bg-surface-1/50"
            style={{ paddingLeft: `${40 + indent}px` }}
          >
            <span className="text-xs text-text-muted whitespace-nowrap">{t('group.parentGroup')}:</span>
            <select
              value={editingParentId}
              onChange={e => setEditingParentId(e.target.value)}
              className="input-field flex-1 text-xs py-1"
              disabled={updating}
            >
              <option value="">{t('group.root')}</option>
              {getParentOptions(g.id).map(pg => (
                <option key={pg.id} value={pg.id}>{pg.path}</option>
              ))}
            </select>
          </div>
        )}

        {/* 子分组 */}
        {hasChildren && isExpanded && (
          <div className="border-l border-surface-2/50 ml-6">
            {node.children.map(child => renderGroupNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-surface-1 border border-surface-2/50 rounded-2xl w-[480px] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="p-5 border-b border-surface-2/50 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
              <FolderTree size={20} className="text-accent" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text-primary">{t('group.title')}</h2>
              <p className="text-xs text-text-muted">{groups.length} {t('group.items')}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-surface-2 rounded-xl text-text-muted hover:text-text-primary transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* 新建分组 */}
        <div className="p-4 border-b border-surface-2/50 bg-surface-0/30 flex-shrink-0">
          <div className="flex gap-3">
            <div className="flex-1">
              <input
                value={newGroupName}
                onChange={e => setNewGroupName(e.target.value)}
                placeholder={t('group.newName')}
                className="input-field w-full"
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
              />
            </div>
            <div className="w-36">
              <select
                value={newGroupParentId}
                onChange={e => setNewGroupParentId(e.target.value)}
                className="input-field w-full text-sm"
              >
                <option value="">{t('group.root')}</option>
                {groups.map(g => (
                  <option key={g.id} value={g.id}>{g.path}</option>
                ))}
              </select>
            </div>
            <button
              onClick={handleCreate}
              disabled={creating || !newGroupName.trim()}
              className="btn btn-primary px-4 flex items-center gap-2"
            >
              {creating ? (
                <span className="animate-spin">⏳</span>
              ) : (
                <Plus size={16} />
              )}
              <span className="hidden sm:inline">{t('group.create')}</span>
            </button>
          </div>
        </div>

        {/* 分组列表 */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {!groupsTree.length ? (
            <div className="p-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-surface-2 flex items-center justify-center mx-auto mb-4">
                <FolderPlus size={28} className="text-text-muted" />
              </div>
              <p className="text-text-muted text-sm">{t('group.noGroups')}</p>
              <p className="text-text-muted/60 text-xs mt-1">{t('group.noGroupsTip')}</p>
            </div>
          ) : (
            <div>
              {groupsTree.map(node => renderGroupNode(node))}
            </div>
          )}
        </div>

        {/* 底部 */}
        <div className="p-4 border-t border-surface-2/50 flex justify-end flex-shrink-0">
          <button onClick={onClose} className="btn btn-secondary">{t('common.close')}</button>
        </div>
      </div>
    </div>
  )
}