import { create } from 'zustand'
import { api, runtime, generateId, Session, Group, GroupNode, ConnectionStatus, ImportPreview, ImportOptions } from '../api/wails'

interface State {
  sessions: Session[]
  groups: Group[]
  groupsTree: GroupNode[]
  connectionStatus: Record<string, ConnectionStatus>
  tabSessionMap: Record<string, string>
  connectionStartTime: Record<string, number>
  connectionInfo: Record<string, Record<string, string>> // 连接详情，key 为 tabId
  loading: boolean
  error: string | null

  // Session 方法
  loadSessions: () => Promise<void>
  createSession: (session: Partial<Session>) => Promise<Session>
  updateSession: (session: Session) => Promise<void>
  deleteSession: (id: string) => Promise<void>
  cloneSession: (id: string) => Promise<Session>
  searchSessions: (keyword: string) => Promise<void>

  // Tab 连接方法
  connectTab: (tabId: string, sessionId: string, cols?: number, rows?: number) => Promise<void>
  disconnectTab: (tabId: string) => Promise<void>
  getTabStatus: (tabId: string) => ConnectionStatus
  setTabStatus: (tabId: string, status: ConnectionStatus) => void
  sendToTab: (tabId: string, data: string) => Promise<void>
  resizeTab: (tabId: string, cols: number, rows: number) => Promise<void>
  getSessionStatus: (sessionId: string) => ConnectionStatus
  getConnectionDuration: (tabId: string) => number
  getConnectionInfo: (tabId: string) => Record<string, string> | null
  loadConnectionInfo: (tabId: string) => Promise<void>
  cleanupTab: (tabId: string) => void

  // 导入导出
  exportConfig: () => Promise<string>
  exportConfigWithOptions: (includeSensitive: boolean) => Promise<string>
  previewImport: (jsonData: string) => Promise<ImportPreview>
  importConfig: (jsonData: string) => Promise<void>
  importConfigWithOptions: (jsonData: string, options: ImportOptions) => Promise<void>
  confirmDialog: (title: string, message: string) => Promise<boolean>

  // Group 方法
  loadGroups: () => Promise<void>
  loadGroupsTree: () => Promise<void>
  createGroup: (name: string, parentId?: string) => Promise<Group>
  updateGroup: (id: string, name: string, parentId?: string) => Promise<Group>
  reorderGroups: (groupIds: string[]) => Promise<void>
  moveGroup: (id: string, newParentId: string) => Promise<void>
  deleteGroup: (id: string) => Promise<void>
}

// 默认会话值
const defaultSession: Partial<Session> = {
  protocol: 'ssh',
  port: 22,
  authType: 'password',
  keepAlive: 30,
  terminalType: 'xterm-256color',
  fontSize: 14,
  encoding: 'UTF-8',
  dataBits: 8,
  stopBits: 1,
  parity: 'none',
  loginScript: [],
  tags: [],
}

export const useSessionStore = create<State>((set, get) => ({
  sessions: [],
  groups: [],
  groupsTree: [],
  connectionStatus: {},
  tabSessionMap: {},
  connectionStartTime: {},
  connectionInfo: {},
  loading: false,
  error: null,

  // Session 方法
  loadSessions: async () => {
    set({ loading: true, error: null })
    try {
      const sessions = await api.listSessions()
      set({ sessions: sessions || [], loading: false })
    } catch (err) {
      set({ error: String(err), loading: false })
    }
  },

  createSession: async (session) => {
    const now = new Date().toISOString()
    const newSession: Session = {
      ...defaultSession,
      ...session,
      id: session.id || generateId(),
      createdAt: now,
      updatedAt: now,
      lastUsedAt: '',
    } as Session
    await api.createSession(newSession)
    await get().loadSessions()
    return newSession
  },

  updateSession: async (session) => {
    session.updatedAt = new Date().toISOString()
    await api.updateSession(session)
    await get().loadSessions()
  },

  deleteSession: async (id) => {
    await api.deleteSession(id)
    await get().loadSessions()
  },

  cloneSession: async (id) => {
    const cloned = await api.cloneSession(id)
    await get().loadSessions()
    return cloned
  },

  searchSessions: async (keyword) => {
    if (keyword.trim()) {
      const sessions = await api.searchSessions(keyword)
      set({ sessions: sessions || [] })
    } else {
      await get().loadSessions()
    }
  },

  // Tab 连接方法
  connectTab: async (tabId, sessionId, cols = 80, rows = 24) => {
    set(state => ({
      tabSessionMap: { ...state.tabSessionMap, [tabId]: sessionId },
      connectionStatus: { ...state.connectionStatus, [tabId]: 'connecting' }
    }))
    try {
      await api.connectTab(tabId, sessionId, cols, rows)
      set(state => ({
        connectionStatus: { ...state.connectionStatus, [tabId]: 'connected' },
        connectionStartTime: { ...state.connectionStartTime, [tabId]: Date.now() }
      }))
    } catch (err) {
      set(state => ({
        connectionStatus: { ...state.connectionStatus, [tabId]: 'error' },
        error: String(err)
      }))
      throw err
    }
  },

  disconnectTab: async (tabId) => {
    await api.disconnectTab(tabId)
    set(state => ({
      connectionStatus: { ...state.connectionStatus, [tabId]: 'disconnected' },
      connectionStartTime: { ...state.connectionStartTime, [tabId]: 0 }
    }))
  },

  getTabStatus: (tabId) => get().connectionStatus[tabId] || 'disconnected',

  setTabStatus: (tabId, status) => {
    set(state => ({ connectionStatus: { ...state.connectionStatus, [tabId]: status } }))
  },

  sendToTab: async (tabId, data) => {
    await api.sendToTab(tabId, data)
  },

  resizeTab: async (tabId, cols, rows) => {
    await api.resizeTab(tabId, cols, rows)
  },

  getSessionStatus: (sessionId) => {
    const { connectionStatus, tabSessionMap } = get()
    const priority: ConnectionStatus[] = ['connected', 'connecting', 'error', 'disconnected']

    const tabIds = Object.entries(tabSessionMap)
      .filter(([, sid]) => sid === sessionId)
      .map(([tabId]) => tabId)

    for (const p of priority) {
      for (const tabId of tabIds) {
        if (connectionStatus[tabId] === p) return p
      }
    }
    return 'disconnected'
  },

  getConnectionDuration: (tabId) => {
    const { connectionStatus, connectionStartTime } = get()
    if (connectionStatus[tabId] !== 'connected' || !connectionStartTime[tabId]) return 0
    return Math.floor((Date.now() - connectionStartTime[tabId]) / 1000)
  },

  getConnectionInfo: (tabId) => get().connectionInfo[tabId] || null,

  loadConnectionInfo: async (tabId) => {
    try {
      const info = await api.getConnectionInfo(tabId)
      if (info) {
        set(state => ({
          connectionInfo: { ...state.connectionInfo, [tabId]: info }
        }))
      }
    } catch (err) {
      console.error('Failed to load connection info:', err)
    }
  },

  cleanupTab: (tabId) => {
    set(state => {
      const { [tabId]: _, ...restStatus } = state.connectionStatus
      const { [tabId]: __, ...restMap } = state.tabSessionMap
      const { [tabId]: ___, ...restTime } = state.connectionStartTime
      const { [tabId]: ____, ...restInfo } = state.connectionInfo
      return { connectionStatus: restStatus, tabSessionMap: restMap, connectionStartTime: restTime, connectionInfo: restInfo }
    })
  },

  // 导入导出
  exportConfig: async () => api.exportConfig(),
  exportConfigWithOptions: async (includeSensitive) => api.exportConfigWithOptions(includeSensitive),
  previewImport: async (jsonData) => api.previewImport(jsonData),

  importConfig: async (jsonData) => {
    await api.importConfig(jsonData)
    await get().loadSessions()
    await get().loadGroups()
  },

  importConfigWithOptions: async (jsonData, options) => {
    await api.importConfigWithOptions(jsonData, options)
    await get().loadSessions()
    await get().loadGroups()
  },

  confirmDialog: async (title, message) => api.confirmDialog(title, message),

  // Group 方法
  loadGroups: async () => {
    try {
      const groups = await api.listGroups()
      set({ groups: groups || [] })
    } catch (err) {
      console.error('Failed to load groups:', err)
    }
  },

  loadGroupsTree: async () => {
    try {
      const tree = await api.listGroupsTree()
      set({ groupsTree: tree || [] })
    } catch (err) {
      console.error('Failed to load groups tree:', err)
    }
  },

  createGroup: async (name, parentId = '') => {
    const group = await api.createGroup(name, parentId)
    await get().loadGroups()
    await get().loadGroupsTree()
    return group
  },

  updateGroup: async (id, name, parentId = '') => {
    const group = await api.updateGroup(id, name, parentId)
    await get().loadGroups()
    await get().loadGroupsTree()
    await get().loadSessions()
    return group
  },

  reorderGroups: async (groupIds) => {
    await api.reorderGroups(groupIds)
    await get().loadGroups()
    await get().loadGroupsTree()
  },

  moveGroup: async (id, newParentId) => {
    await api.moveGroup(id, newParentId)
    await get().loadGroups()
    await get().loadGroupsTree()
    await get().loadSessions()
  },

  deleteGroup: async (id) => {
    await api.deleteGroup(id)
    await get().loadGroups()
    await get().loadGroupsTree()
    await get().loadSessions()
  },
}))

// 导出 runtime 供组件使用
export { runtime }