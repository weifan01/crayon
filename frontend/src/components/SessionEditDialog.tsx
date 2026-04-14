import { useState, useEffect } from 'react'
import { Plus, Edit3 } from 'lucide-react'
import { useSessionStore } from '../stores/sessionStore'
import { useLocale } from '../stores/localeStore'
import { DraggableDialog } from './ui'
import type { Session, Group } from '../api/wails'

interface SessionEditDialogProps {
  show: boolean
  isNew: boolean
  edit: Partial<Session>
  groups: Group[]
  onClose: () => void
  onSave: (session: Partial<Session>) => Promise<void>
  setEdit: (session: Partial<Session>) => void
}

export function SessionEditDialog({
  show,
  isNew,
  edit,
  groups,
  onClose,
  onSave,
  setEdit,
}: SessionEditDialogProps) {
  const { t } = useLocale()
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (show) {
      setErr('')
    }
  }, [show])

  const handleSave = async () => {
    if (!edit.name) {
      setErr(t('common.nameRequired'))
      return
    }

    // 协议验证
    if (edit.protocol === 'ssh' || edit.protocol === 'telnet') {
      if (!edit.host) {
        setErr(t('session.hostRequired'))
        return
      }
      if (edit.protocol === 'ssh' && !edit.user) {
        setErr(t('session.usernameRequired'))
        return
      }
    } else if (edit.protocol === 'serial') {
      if (!edit.host) {
        setErr(t('session.serialPathRequired'))
        return
      }
    }

    setSaving(true)
    setErr('')
    try {
      await onSave(edit)
      onClose()
    } catch (e) {
      setErr(String(e))
    } finally {
      setSaving(false)
    }
  }

  if (!show) return null

  return (
    <DraggableDialog
      onClose={onClose}
      title={isNew ? t('sidebar.newSession') : t('sidebar.editSession')}
      icon={isNew ? Plus : Edit3}
      width={480}
    >
      {err && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-700/50 rounded-lg text-red-400 text-sm">
          {err}
        </div>
      )}

      <div className="space-y-4">
        {/* 名称 */}
        <div>
          <label className="block text-sm text-text-secondary mb-1">{t('common.name')} *</label>
          <input
            value={edit.name || ''}
            onChange={e => setEdit({ ...edit, name: e.target.value })}
            className="input-field"
            autoFocus
          />
        </div>

        {/* 协议 */}
        <div>
          <label className="block text-sm text-text-secondary mb-1">{t('common.protocol')}</label>
          <select
            value={edit.protocol || 'ssh'}
            onChange={e => setEdit({ ...edit, protocol: e.target.value as Session['protocol'] })}
            className="input-field"
          >
            <option value="ssh">SSH</option>
            <option value="telnet">Telnet</option>
            <option value="serial">Serial</option>
            <option value="local">{t('quickConnect.local')}</option>
          </select>
        </div>

        {/* Serial 协议配置 */}
        {edit.protocol === 'serial' && (
          <>
            <div>
              <label className="block text-sm text-text-secondary mb-1">{t('session.serialPath')} *</label>
              <input
                value={edit.host || ''}
                onChange={e => setEdit({ ...edit, host: e.target.value })}
                placeholder="/dev/ttyUSB0 / COM1"
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1">{t('session.baudRate')}</label>
              <select
                value={edit.port || 9600}
                onChange={e => setEdit({ ...edit, port: +e.target.value })}
                className="input-field"
              >
                <option value="9600">9600</option>
                <option value="19200">19200</option>
                <option value="38400">38400</option>
                <option value="57600">57600</option>
                <option value="115200">115200</option>
              </select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm text-text-secondary mb-1">{t('session.dataBits')}</label>
                <select
                  value={edit.dataBits || 8}
                  onChange={e => setEdit({ ...edit, dataBits: +e.target.value })}
                  className="input-field"
                >
                  <option value="5">5</option>
                  <option value="6">6</option>
                  <option value="7">7</option>
                  <option value="8">8</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-text-secondary mb-1">{t('session.stopBits')}</label>
                <select
                  value={edit.stopBits || 1}
                  onChange={e => setEdit({ ...edit, stopBits: +e.target.value })}
                  className="input-field"
                >
                  <option value="1">1</option>
                  <option value="2">2</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-text-secondary mb-1">{t('session.parity')}</label>
                <select
                  value={edit.parity || 'none'}
                  onChange={e => setEdit({ ...edit, parity: e.target.value as 'none' | 'even' | 'odd' })}
                  className="input-field"
                >
                  <option value="none">None</option>
                  <option value="even">Even</option>
                  <option value="odd">Odd</option>
                </select>
              </div>
            </div>
          </>
        )}

        {/* SSH/Telnet 协议配置 */}
        {(edit.protocol === 'ssh' || edit.protocol === 'telnet') && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-sm text-text-secondary mb-1">{t('common.host')} *</label>
                <input
                  value={edit.host || ''}
                  onChange={e => setEdit({ ...edit, host: e.target.value })}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm text-text-secondary mb-1">{t('common.port')}</label>
                <input
                  type="number"
                  value={edit.port || (edit.protocol === 'telnet' ? 23 : 22)}
                  onChange={e => setEdit({ ...edit, port: +e.target.value || (edit.protocol === 'telnet' ? 23 : 22) })}
                  className="input-field"
                />
              </div>
            </div>

            {/* SSH 特定配置 */}
            {edit.protocol === 'ssh' && (
              <>
                <div>
                  <label className="block text-sm text-text-secondary mb-1">{t('session.username')} *</label>
                  <input
                    value={edit.user || ''}
                    onChange={e => setEdit({ ...edit, user: e.target.value })}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm text-text-secondary mb-1">{t('session.authType')}</label>
                  <select
                    value={edit.authType || 'password'}
                    onChange={e => setEdit({ ...edit, authType: e.target.value as Session['authType'] })}
                    className="input-field"
                  >
                    <option value="password">{t('session.password')}</option>
                    <option value="key">{t('session.publicKey')}</option>
                  </select>
                </div>
                {edit.authType === 'password' && (
                  <div>
                    <label className="block text-sm text-text-secondary mb-1">{t('session.password')}</label>
                    <input
                      type="password"
                      value={edit.password || ''}
                      onChange={e => setEdit({ ...edit, password: e.target.value })}
                      className="input-field"
                    />
                  </div>
                )}
                {edit.authType === 'key' && (
                  <>
                    <div>
                      <label className="block text-sm text-text-secondary mb-1">{t('session.keyPath')}</label>
                      <input
                        value={edit.keyPath || ''}
                        onChange={e => setEdit({ ...edit, keyPath: e.target.value })}
                        placeholder="~/.ssh/id_rsa"
                        className="input-field"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-text-secondary mb-1">{t('session.keyPassphrase')}</label>
                      <input
                        type="password"
                        value={edit.keyPassphrase || ''}
                        onChange={e => setEdit({ ...edit, keyPassphrase: e.target.value })}
                        placeholder={t('session.optional')}
                        className="input-field"
                      />
                    </div>
                  </>
                )}
              </>
            )}

            {/* Telnet 特定配置 */}
            {edit.protocol === 'telnet' && (
              <>
                <div className="p-2 bg-surface-2 rounded text-xs text-text-muted mb-2">
                  {t('session.telnetLoginHint')}
                </div>
                <div>
                  <label className="block text-sm text-text-secondary mb-1">{t('session.username')}</label>
                  <input
                    value={edit.user || ''}
                    onChange={e => setEdit({ ...edit, user: e.target.value })}
                    placeholder={t('session.optional')}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm text-text-secondary mb-1">{t('session.password')}</label>
                  <input
                    type="password"
                    value={edit.password || ''}
                    onChange={e => setEdit({ ...edit, password: e.target.value })}
                    placeholder={t('session.optional')}
                    className="input-field"
                  />
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="checkbox"
                    id="noNegotiation"
                    checked={edit.noNegotiation || false}
                    onChange={e => setEdit({ ...edit, noNegotiation: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <label htmlFor="noNegotiation" className="text-sm text-text-secondary cursor-pointer">
                    {t('session.noNegotiation')}
                  </label>
                </div>
                <p className="text-xs text-text-muted mt-1">{t('session.noNegotiationHint')}</p>
              </>
            )}
          </>
        )}

        {/* Local 协议配置 */}
        {edit.protocol === 'local' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-text-secondary mb-1">{t('quickConnect.localShell')}</label>
              <select
                value={edit.host || ''}
                onChange={e => setEdit({ ...edit, host: e.target.value })}
                className="input-field"
              >
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
              <input
                value={edit.user || ''}
                onChange={e => setEdit({ ...edit, user: e.target.value })}
                placeholder={t('quickConnect.workingDirPlaceholder')}
                className="input-field"
              />
            </div>
          </div>
        )}

        {/* 分组 */}
        <div>
          <label className="block text-sm text-text-secondary mb-1">{t('session.group')}</label>
          <select
            value={edit.group || ''}
            onChange={e => setEdit({ ...edit, group: e.target.value })}
            className="input-field"
          >
            <option value="">{t('sidebar.noGroup')}</option>
            {groups.map(g => (
              <option key={g.id} value={g.path}>{g.path}</option>
            ))}
          </select>
        </div>

        {/* 描述 */}
        <div>
          <label className="block text-sm text-text-secondary mb-1">{t('session.description')}</label>
          <textarea
            value={edit.description || ''}
            onChange={e => setEdit({ ...edit, description: e.target.value })}
            rows={2}
            className="input-field resize-none"
          />
        </div>
      </div>

      <div className="flex justify-end gap-3 mt-6">
        <button onClick={onClose} className="btn btn-secondary" disabled={saving}>
          {t('common.cancel')}
        </button>
        <button onClick={handleSave} className="btn btn-primary" disabled={saving}>
          {saving ? t('sidebar.saving') : t('common.save')}
        </button>
      </div>
    </DraggableDialog>
  )
}