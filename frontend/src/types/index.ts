export interface Session {
  id: string
  name: string
  group: string
  description: string
  protocol: 'ssh' | 'telnet' | 'serial'
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
  // Serial 协议专用字段
  dataBits: number
  stopBits: number
  parity: 'none' | 'even' | 'odd'
  loginScript: string[]
  createdAt: string
  updatedAt: string
  lastUsedAt: string
  tags: string[]
}

export interface TerminalTab {
  id: string
  sessionId: string
  title: string
  cols: number
  rows: number
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'