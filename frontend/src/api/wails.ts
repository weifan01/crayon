/**
 * Wails Go 后端 API 封装
 * 统一管理所有后端方法调用
 */

// ============ 类型定义 ============

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface BackgroundSettings {
  enabled: boolean
  storageType: 'file' | 'base64'
  imageData?: string
  imagePath?: string
  opacity: number
  blur: number
  fitMode: 'cover' | 'contain' | 'tile' | 'fill'
  position: 'center' | 'top' | 'bottom' | 'left' | 'right'
  scope: 'app' | 'terminal' | 'both'
}

export interface BackgroundFileInfo {
  name: string
  size: number
  modifiedTime: string
}

export interface PersonalizationTemplate {
  id: string
  name: string
  description: string
  createdAt: string
  updatedAt: string
  useCustomSettings: boolean
  fontSize: number
  fontFamily: string
  themeId: string
  scrollback: number
  backgroundImage: string
  backgroundOpacity: number
  backgroundBlur: number
  cursorStyle: 'block' | 'underline' | 'bar'
  cursorBlink: boolean
  lineHeight: number
  letterSpacing: number
}

export interface Session {
  id: string
  name: string
  group: string
  description: string
  protocol: 'ssh' | 'telnet' | 'serial' | 'local'
  host: string
  port: number
  user: string
  authType: 'password' | 'key' | 'agent'
  password: string
  keyPath: string
  keyPassphrase: string
  keepAlive: number
  proxyJump: string
  proxyCommand: string
  terminalType: string
  fontSize: number
  fontFamily: string
  themeId: string
  encoding: string
  dataBits: number
  stopBits: number
  parity: string
  noNegotiation: boolean // Telnet: 禁用协议协商
  localEnv: string[]      // Local: 本地Shell的环境变量
  loginScript: string[]
  tags: string[]
  createdAt: string
  updatedAt: string
  lastUsedAt: string
  // 个性化设置
  useCustomSettings?: boolean
  templateId?: string
  scrollback?: number
  backgroundImage?: string
  backgroundOpacity?: number
  backgroundBlur?: number
  cursorStyle?: 'block' | 'underline' | 'bar'
  cursorBlink?: boolean
  lineHeight?: number
  letterSpacing?: number
}

export interface Group {
  id: string
  name: string
  parentId: string
  path: string
  createdAt: string
  updatedAt: string
}

export interface GroupNode {
  group: Group
  children: GroupNode[]
}

export interface Command {
  id: string
  name: string
  group: string
  description: string
  content: string
  variables: { name: string; default: string; description: string }[]
  shortcut: string
  createdAt: string
  updatedAt: string
}

export interface ImportPreview {
  sessions: ImportSessionPreview[]
  commands: ImportCommandPreview[]
  totalSessions: number
  totalCommands: number
  newSessions: number
  duplicateCount: number
}

// SecureCRT 导入预览
export interface SecureCRTSessionPreview {
  name: string
  group: string
  host: string
  port: number
  protocol: string
  username: string
  authType: string
  keyPath: string
}

export interface ImportSessionPreview {
  id: string
  name: string
  host: string
  protocol: string
  isNew: boolean
  existsName: string
}

export interface ImportCommandPreview {
  id: string
  name: string
  content: string
  isNew: boolean
}

export interface ImportOptions {
  sessionMode: 'skip' | 'overwrite' | 'rename'
  commandMode: 'skip' | 'overwrite' | 'rename'
  selectedIds: string[]
  sessionNewIds?: Record<string, string>
}

export interface LogFileInfo {
  weekDir: string
  filename: string
  fullPath: string
  size: number
  modifiedTime: string
}

// ============ Wails API 封装 ============

const getWailsAPI = () => (window as any)['go']['main']['App']

export const api = {
  // Session 管理
  listSessions: (): Promise<Session[]> => getWailsAPI().ListSessions(),
  getSession: (id: string): Promise<Session> => getWailsAPI().GetSession(id),
  createSession: (session: Partial<Session>): Promise<void> => getWailsAPI().CreateSession(session),
  updateSession: (session: Session): Promise<void> => getWailsAPI().UpdateSession(session),
  deleteSession: (id: string): Promise<void> => getWailsAPI().DeleteSession(id),
  cloneSession: (id: string): Promise<Session> => getWailsAPI().CloneSession(id),
  searchSessions: (keyword: string): Promise<Session[]> => getWailsAPI().SearchSessions(keyword),

  // Group 管理
  listGroups: (): Promise<Group[]> => getWailsAPI().ListGroups(),
  listGroupsTree: (): Promise<GroupNode[]> => getWailsAPI().ListGroupsTree(),
  createGroup: (name: string, parentId: string): Promise<Group> => getWailsAPI().CreateGroup(name, parentId),
  updateGroup: (id: string, name: string, parentId: string): Promise<Group> => getWailsAPI().UpdateGroup(id, name, parentId),
  moveGroup: (id: string, newParentId: string): Promise<void> => getWailsAPI().MoveGroup(id, newParentId),
  deleteGroup: (id: string): Promise<void> => getWailsAPI().DeleteGroup(id),

  // 个性化模板管理
  listTemplates: (): Promise<PersonalizationTemplate[]> => getWailsAPI().ListTemplates(),
  getTemplate: (id: string): Promise<PersonalizationTemplate> => getWailsAPI().GetTemplate(id),
  createTemplate: (template: Partial<PersonalizationTemplate>): Promise<void> => getWailsAPI().CreateTemplate(template),
  updateTemplate: (template: PersonalizationTemplate): Promise<void> => getWailsAPI().UpdateTemplate(template),
  deleteTemplate: (id: string): Promise<void> => getWailsAPI().DeleteTemplate(id),
  applyTemplateToSessions: (templateId: string, sessionIds: string[]): Promise<void> =>
    getWailsAPI().ApplyTemplateToSessions(templateId, sessionIds),

  // Tab 连接
  connectTab: (tabId: string, sessionId: string, cols: number, rows: number): Promise<void> =>
    getWailsAPI().ConnectTab(tabId, sessionId, cols, rows),
  disconnectTab: (tabId: string): Promise<void> => getWailsAPI().DisconnectTab(tabId),
  getTabStatus: (tabId: string): Promise<string> => getWailsAPI().GetTabStatus(tabId),
  sendToTab: (tabId: string, data: string): Promise<void> => getWailsAPI().SendToTab(tabId, data),
  resizeTab: (tabId: string, cols: number, rows: number): Promise<void> =>
    getWailsAPI().ResizeTab(tabId, cols, rows),
  needLocalEcho: (tabId: string): Promise<boolean> => getWailsAPI().NeedLocalEcho(tabId),

  // Command 管理
  listCommands: (): Promise<Command[]> => getWailsAPI().ListCommands(),
  getCommand: (id: string): Promise<Command> => getWailsAPI().GetCommand(id),
  createCommand: (cmd: Partial<Command>): Promise<void> => getWailsAPI().CreateCommand(cmd),
  updateCommand: (cmd: Command): Promise<void> => getWailsAPI().UpdateCommand(cmd),
  deleteCommand: (id: string): Promise<void> => getWailsAPI().DeleteCommand(id),
  searchCommands: (keyword: string): Promise<Command[]> => getWailsAPI().SearchCommands(keyword),
  executeBatch: (req: any): Promise<any[]> => getWailsAPI().ExecuteBatch(req),

  // 导入导出
  exportConfig: (): Promise<string> => getWailsAPI().ExportConfig(),
  exportConfigWithOptions: (includeSensitive: boolean): Promise<string> =>
    getWailsAPI().ExportConfigWithOptions(includeSensitive),
  previewImport: (jsonData: string): Promise<ImportPreview> => getWailsAPI().PreviewImport(jsonData),
  importConfig: (jsonData: string): Promise<void> => getWailsAPI().ImportConfig(jsonData),
  importConfigWithOptions: (jsonData: string, options: ImportOptions): Promise<void> =>
    getWailsAPI().ImportConfigWithOptions(jsonData, options),

  // SecureCRT 导入
  parseSecureCRTFile: (filePath: string): Promise<{ sessions: SecureCRTSessionPreview[], groups: string[] }> =>
    getWailsAPI().ParseSecureCRTFile(filePath),
  importSecureCRTSessions: (sessions: Record<string, any>[]): Promise<void> =>
    getWailsAPI().ImportSecureCRTSessions(sessions),

  // 文件操作
  saveFile: (title: string, defaultFilename: string, defaultPath: string): Promise<string> =>
    getWailsAPI().SaveFile(title, defaultFilename, defaultPath),
  selectFile: (title: string, defaultPath: string, filters: string): Promise<string> =>
    getWailsAPI().SelectFile(title, defaultPath, filters),
  writeFileString: (path: string, data: string): Promise<void> => getWailsAPI().WriteFileString(path, data),
  readFileString: (path: string): Promise<string> => getWailsAPI().ReadFileString(path),
  readFileBase64: (path: string): Promise<string> => getWailsAPI().ReadFileBase64(path),

  // 日志
  getLogList: (): Promise<LogFileInfo[]> => getWailsAPI().GetLogList(),
  readLogFile: (fullPath: string): Promise<string> => getWailsAPI().ReadLogFile(fullPath),
  getLogDir: (): Promise<string> => getWailsAPI().GetLogDir(),

  // 窗口
  windowToggleFullscreen: (): Promise<void> => getWailsAPI().WindowToggleFullscreen(),
  windowIsFullscreen: (): Promise<boolean> => getWailsAPI().WindowIsFullscreen(),

  // 剪贴板
  clipboardWrite: (text: string): Promise<void> => getWailsAPI().ClipboardWrite(text),
  clipboardRead: (): Promise<string> => getWailsAPI().ClipboardRead(),

  // 对话框
  confirmDialog: (title: string, message: string): Promise<boolean> => getWailsAPI().ConfirmDialog(title, message),

  // 语言设置
  setLanguage: (lang: string): Promise<void> => getWailsAPI().SetLanguage(lang),
  getLanguage: (): Promise<string> => getWailsAPI().GetLanguage(),

  // 背景图片
  saveBackgroundImage: (imageData: string, filename: string): Promise<string> =>
    getWailsAPI().SaveBackgroundImage(imageData, filename),
  loadBackgroundImage: (filename: string): Promise<string> =>
    getWailsAPI().LoadBackgroundImage(filename),
  deleteBackgroundImage: (filename: string): Promise<void> =>
    getWailsAPI().DeleteBackgroundImage(filename),
  getBackgroundDir: (): Promise<string> =>
    getWailsAPI().GetBackgroundDir(),
  listBackgroundImages: (): Promise<BackgroundFileInfo[]> =>
    getWailsAPI().ListBackgroundImages(),
}

// ============ Runtime API ============

export const runtime = {
  eventsOn: (event: string, callback: (...args: any[]) => void): void =>
    (window as any)['runtime']['EventsOn'](event, callback),
  eventsOff: (event: string): void => (window as any)['runtime']['EventsOff'](event),
  eventsEmit: (event: string, ...args: any[]): void => (window as any)['runtime']['EventsEmit'](event, ...args),
}

// ============ 工具函数 ============

export const generateId = (): string => {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 10)
  return `${timestamp}-${random}`
}