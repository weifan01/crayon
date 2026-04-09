import { useEffect, useState } from 'react'
import { useSessionStore } from '../stores/sessionStore'
import { useTerminalStore } from '../stores/terminalStore'
import { useLocale } from '../stores/localeStore'
import { api } from '../api/wails'
import { Terminal, Plus, Play, Edit3, Trash2, X, ChevronDown, ChevronRight } from 'lucide-react'

interface Props {
  onClose: () => void
}

export function CommandPanel({ onClose }: Props) {
  const { sessions, getTabStatus, sendToTab } = useSessionStore()
  const { tabs } = useTerminalStore()
  const { t } = useLocale()
  const [commands, setCommands] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [kw, setKw] = useState('')
  const [show, setShow] = useState(false)
  const [edit, setEdit] = useState<any>({})
  const [isNew, setIsNew] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})
  const [showBatch, setShowBatch] = useState(false)
  const [selectedTabs, setSelectedTabs] = useState<string[]>([])
  const [batchCommand, setBatchCommand] = useState('')

  const loadCommands = async () => {
    setLoading(true)
    try {
      const result = await api.listCommands()
      setCommands(result || [])
    } catch (e) {
      console.error('Failed to load commands:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadCommands() }, [])

  // 按分组组织命令
  const groups = commands.reduce((a: Record<string, any[]>, c: any) => {
    const g = c.group || t('sidebar.noGroups')
    ;(a[g] = a[g] || []).push(c)
    return a
  }, {})

  // 获取分屏树的第一个 pane
  const getFirstPane = (node: any): any => {
    if (node.type === 'pane') return node
    return getFirstPane(node.children[0])
  }

  // 获取所有 pane 的 ID
  const getAllPaneIds = (node: any): string[] => {
    if (node.type === 'pane') return [node.id]
    return [...getAllPaneIds(node.children[0]), ...getAllPaneIds(node.children[1])]
  }

  // 获取已连接的标签页（带会话信息）
  const connectedTabs = tabs.flatMap(tab => {
    const allPaneIds = getAllPaneIds(tab.rootPane)
    return allPaneIds
      .filter(paneId => getTabStatus(paneId) === 'connected')
      .map(paneId => {
        const firstPane = getFirstPane(tab.rootPane)
        return {
          paneId,
          title: firstPane.title,
          session: sessions.find((s: any) => s.id === firstPane.sessionId)
        }
      })
  })

  const handleNew = () => {
    setIsNew(true)
    setEdit({ name: '', content: '', group: '', description: '' })
    setErr('')
    setShow(true)
  }

  const handleEdit = (cmd: any) => {
    setIsNew(false)
    setEdit({ ...cmd })
    setErr('')
    setShow(true)
  }

  const handleDelete = async (id: string) => {
    if (confirm(t('command.confirmDelete'))) {
      await api.deleteCommand(id)
      loadCommands()
    }
  }

  const handleSave = async () => {
    if (!edit.name?.trim()) { setErr(t('command.errNameRequired')); return }
    if (!edit.content?.trim()) { setErr(t('command.errContentRequired')); return }
    setSaving(true)
    setErr('')
    try {
      const cmd = {
        ...edit,
        id: edit.id || `cmd-${Date.now()}`,
        createdAt: edit.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      if (isNew) {
        await api.createCommand(cmd)
      } else {
        await api.updateCommand(cmd)
      }
      setShow(false)
      loadCommands()
    } catch (e) { setErr(String(e)) }
    finally { setSaving(false) }
  }

  const toggleGroup = (group: string) => {
    setExpandedGroups(prev => ({ ...prev, [group]: !prev[group] }))
  }

  // 发送命令到选中的标签页
  const sendCommandToTabs = async (paneIds: string[], command: string) => {
    for (const paneId of paneIds) {
      try {
        await sendToTab(paneId, command + '\n')
      } catch (e) {
        console.error(`Failed to send to ${paneId}:`, e)
      }
    }
  }

  const handleQuickExecute = (cmd: any) => {
    if (connectedTabs.length === 0) {
      alert(t('terminal.noConnectedSessions'))
      return
    }
    setSelectedTabs(connectedTabs.map(t => t.paneId))
    setBatchCommand(cmd.content)
    setShowBatch(true)
  }

  const handleBatchExecute = async () => {
    if (selectedTabs.length === 0) {
      alert(t('terminal.selectSessions'))
      return
    }
    if (!batchCommand.trim()) {
      alert(t('terminal.enterCommand'))
      return
    }
    await sendCommandToTabs(selectedTabs, batchCommand)
    setShowBatch(false)
    setBatchCommand('')
    setSelectedTabs([])
  }

  const toggleTab = (tabId: string) => {
    setSelectedTabs(prev =>
      prev.includes(tabId) ? prev.filter(x => x !== tabId) : [...prev, tabId]
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface-1 border border-surface-2 rounded-lg w-[600px] max-h-[80vh] flex flex-col">
        <div className="p-4 border-b border-surface-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <Terminal size={20} />
            {t('command.title')}
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setShowBatch(true); setSelectedTabs(connectedTabs.map(t => t.paneId)) }}
              className="px-3 py-1.5 text-sm bg-accent-blue/20 text-accent-blue rounded hover:bg-accent-blue/30 flex items-center gap-1"
            >
              <Play size={14} />
              {t('command.batchSend')}
            </button>
            <button onClick={onClose} className="p-1 hover:bg-surface-2 rounded text-text-muted">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="p-3 border-b border-surface-2 flex items-center gap-2">
          <input
            value={kw}
            onChange={async e => {
              setKw(e.target.value)
              if (e.target.value.trim()) {
                const result = await api.searchCommands(e.target.value)
                setCommands(result || [])
              } else {
                loadCommands()
              }
            }}
            placeholder={t('command.searchPlaceholder')}
            className="input-field flex-1 text-sm"
          />
          <button onClick={handleNew} className="btn btn-primary text-sm flex items-center gap-1">
            <Plus size={16} />
            {t('command.new')}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="p-4 text-center text-text-muted">{t('command.loading')}</div>
          ) : !commands.length ? (
            <div className="p-4 text-center text-text-muted">
              <p>{t('command.noCommands')}</p>
              <p className="text-sm mt-1">{t('command.noCommandsTip')}</p>
            </div>
          ) : (
            Object.entries(groups).map(([group, cmds]) => (
              <div key={group} className="mb-2">
                <div
                  className="px-3 py-2 text-sm font-medium text-text-secondary cursor-pointer hover:bg-surface-2 rounded flex items-center gap-1"
                  onClick={() => toggleGroup(group)}
                >
                  {expandedGroups[group] !== false ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <span>{group}</span>
                  <span className="text-text-muted text-xs">({(cmds as any[]).length})</span>
                </div>
                {expandedGroups[group] !== false && (cmds as any[]).map(cmd => (
                  <div
                    key={cmd.id}
                    className="group ml-4 p-3 hover:bg-surface-2 rounded-lg cursor-pointer"
                    onClick={() => handleQuickExecute(cmd)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-text-primary">{cmd.name}</div>
                        {cmd.description && (
                          <div className="text-xs text-text-muted mt-1">{cmd.description}</div>
                        )}
                        <div className="text-xs text-text-secondary mt-1 font-mono bg-surface-0 px-2 py-1 rounded inline-block">
                          {cmd.content}
                        </div>
                      </div>
                      <div className="hidden group-hover:flex gap-1 ml-2">
                        <button
                          onClick={e => { e.stopPropagation(); handleEdit(cmd) }}
                          className="p-1 hover:text-accent-blue text-text-muted"
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); handleDelete(cmd.id) }}
                          className="p-1 hover:text-accent-red text-text-muted"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>

        {show && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-60" onClick={() => setShow(false)}>
            <div className="bg-surface-1 border border-surface-2 rounded-lg w-[450px] p-6" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-semibold mb-4 text-text-primary">
                {isNew ? t('command.newCommand') : t('command.editCommand')}
              </h3>
              {err && <div className="mb-4 p-3 bg-red-900/30 border border-red-700/50 rounded text-red-400 text-sm">{err}</div>}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-text-secondary mb-1">{t('command.nameRequired')}</label>
                  <input value={edit.name || ''} onChange={e => setEdit({ ...edit, name: e.target.value })} className="input-field" />
                </div>
                <div>
                  <label className="block text-sm text-text-secondary mb-1">{t('command.contentRequired')}</label>
                  <textarea value={edit.content || ''} onChange={e => setEdit({ ...edit, content: e.target.value })} className="input-field font-mono" rows={3} />
                </div>
                <div>
                  <label className="block text-sm text-text-secondary mb-1">{t('command.group')}</label>
                  <input value={edit.group || ''} onChange={e => setEdit({ ...edit, group: e.target.value })} className="input-field" />
                </div>
                <div>
                  <label className="block text-sm text-text-secondary mb-1">{t('command.description')}</label>
                  <input value={edit.description || ''} onChange={e => setEdit({ ...edit, description: e.target.value })} className="input-field" />
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setShow(false)} className="btn btn-secondary" disabled={saving}>{t('common.cancel')}</button>
                <button onClick={handleSave} className="btn btn-primary" disabled={saving}>{saving ? t('command.saving') : t('common.save')}</button>
              </div>
            </div>
          </div>
        )}

        {showBatch && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-60" onClick={() => setShowBatch(false)}>
            <div className="bg-surface-1 border border-surface-2 rounded-lg w-[500px] p-6" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-semibold mb-4 text-text-primary">{t('command.batchTitle')}</h3>
              <p className="text-xs text-text-muted mb-4">{t('command.batchHint')}</p>

              <div className="mb-4">
                <label className="block text-sm text-text-secondary mb-2">{t('command.targetTabs').replace('{count}', String(connectedTabs.length))}</label>
                <div className="max-h-32 overflow-y-auto border border-surface-2 rounded p-2 bg-surface-0">
                  {connectedTabs.length === 0 ? (
                    <div className="text-text-muted text-sm text-center py-2">{t('command.noConnectedTabs')}</div>
                  ) : (
                    connectedTabs.map(t => (
                      <label key={t.paneId} className="flex items-center gap-2 p-2 hover:bg-surface-1 rounded cursor-pointer">
                        <input type="checkbox" checked={selectedTabs.includes(t.paneId)} onChange={() => toggleTab(t.paneId)} className="rounded" />
                        <span className="text-sm text-text-primary">{t.title}</span>
                        {t.session && <span className="text-xs text-text-muted">{t.session.host}</span>}
                      </label>
                    ))
                  )}
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm text-text-secondary mb-1">{t('command.commandContent')}</label>
                <textarea value={batchCommand} onChange={e => setBatchCommand(e.target.value)} className="input-field font-mono" rows={3} placeholder={t('command.commandPlaceholder')} />
              </div>

              <div className="flex justify-end gap-3">
                <button onClick={() => setShowBatch(false)} className="btn btn-secondary">{t('common.cancel')}</button>
                <button onClick={handleBatchExecute} className="btn btn-primary flex items-center gap-1" disabled={selectedTabs.length === 0}>
                  <Play size={14} /> {t('command.send')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}