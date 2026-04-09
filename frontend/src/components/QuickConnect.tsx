import { useState } from 'react'
import { Zap, X } from 'lucide-react'
import { useSessionStore } from '../stores/sessionStore'
import { useLocale } from '../stores/localeStore'

interface Props {
  onClose: () => void
  onConnect: (id: string) => void
}

export function QuickConnect({ onClose, onConnect }: Props) {
  const { createSession } = useSessionStore()
  const { t } = useLocale()
  const [protocol, setProtocol] = useState<'ssh' | 'telnet'>('ssh')
  const [host, setHost] = useState('')
  const [port, setPort] = useState(22)
  const [user, setUser] = useState('')
  const [authType, setAuthType] = useState<'password' | 'key'>('password')
  const [password, setPassword] = useState('')
  const [keyPath, setKeyPath] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [err, setErr] = useState('')

  const handleConnect = async () => {
    if (!host.trim()) { setErr(t('quickConnect.errHostRequired')); return }
    if (protocol === 'ssh' && !user.trim()) { setErr(t('quickConnect.errUserRequired')); return }
    if (protocol === 'ssh' && authType === 'password' && !password.trim()) { setErr(t('quickConnect.errPasswordRequired')); return }

    setConnecting(true)
    setErr('')
    try {
      const session = await createSession({
        name: protocol === 'ssh' ? `${user}@${host}` : `telnet://${host}`,
        protocol,
        host,
        port,
        user: protocol === 'ssh' ? user : '',
        authType: protocol === 'ssh' ? authType : 'password',
        password: protocol === 'ssh' ? password : '',
        keyPath: protocol === 'ssh' ? keyPath : '',
        group: t('quickConnect.groupName'),
      })
      onConnect(session.id)
      onClose()
    } catch (e) {
      setErr(String(e))
    } finally {
      setConnecting(false)
    }
  }

  // 更新默认端口
  const handleProtocolChange = (newProtocol: 'ssh' | 'telnet') => {
    setProtocol(newProtocol)
    setPort(newProtocol === 'ssh' ? 22 : 23)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface-1 border border-surface-2 rounded-lg w-[450px]" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-surface-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <Zap size={20} />
            {t('quickConnect.title')}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-surface-2 rounded text-text-muted">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {err && <div className="p-3 bg-red-900/30 border border-red-700/50 rounded text-red-400 text-sm">{err}</div>}

          <div>
            <label className="block text-sm text-text-secondary mb-1">{t('quickConnect.protocol')}</label>
            <select
              value={protocol}
              onChange={e => handleProtocolChange(e.target.value as 'ssh' | 'telnet')}
              className="input-field"
            >
              <option value="ssh">SSH</option>
              <option value="telnet">Telnet</option>
            </select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-sm text-text-secondary mb-1">{t('quickConnect.hostRequired')}</label>
              <input
                value={host}
                onChange={e => setHost(e.target.value)}
                placeholder={t('quickConnect.hostPlaceholder')}
                className="input-field"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1">{t('quickConnect.port')}</label>
              <input
                type="number"
                value={port}
                onChange={e => setPort(+e.target.value || (protocol === 'ssh' ? 22 : 23))}
                className="input-field"
              />
            </div>
          </div>

          {protocol === 'ssh' && (
            <>
              <div>
                <label className="block text-sm text-text-secondary mb-1">{t('quickConnect.usernameRequired')}</label>
                <input
                  value={user}
                  onChange={e => setUser(e.target.value)}
                  placeholder={t('quickConnect.usernamePlaceholder')}
                  className="input-field"
                />
              </div>

              <div>
                <label className="block text-sm text-text-secondary mb-1">{t('quickConnect.authType')}</label>
                <select
                  value={authType}
                  onChange={e => setAuthType(e.target.value as 'password' | 'key')}
                  className="input-field"
                >
                  <option value="password">{t('session.password')}</option>
                  <option value="key">{t('session.publicKey')}</option>
                </select>
              </div>

              {authType === 'password' ? (
                <div>
                  <label className="block text-sm text-text-secondary mb-1">{t('quickConnect.passwordRequired')}</label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="input-field"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-sm text-text-secondary mb-1">{t('quickConnect.keyPath')}</label>
                  <input
                    value={keyPath}
                    onChange={e => setKeyPath(e.target.value)}
                    placeholder={t('quickConnect.keyPathPlaceholder')}
                    className="input-field"
                  />
                </div>
              )}
            </>
          )}
        </div>

        <div className="p-4 border-t border-surface-2 flex justify-end gap-3">
          <button onClick={onClose} className="btn btn-secondary" disabled={connecting}>{t('common.cancel')}</button>
          <button onClick={handleConnect} className="btn btn-primary" disabled={connecting}>
            {connecting ? t('quickConnect.connecting') : t('quickConnect.connect')}
          </button>
        </div>
      </div>
    </div>
  )
}