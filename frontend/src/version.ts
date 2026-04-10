// 应用版本信息 - 运行时从后端获取
export interface AppInfo {
  name: string
  version: string
  buildTime: string
  gitCommit: string
  goVersion: string
  platform: string
  author: string
  email: string
  description: string
}

// 默认值（构建时可能使用）
export const APP_VERSION = 'dev'
export const APP_NAME = 'Crayon'

// 作者信息
export const AUTHOR_INFO = {
  name: 'erpan',
  email: 'erpan.site@gmail.com',
  github: 'https://github.com/weifan01/crayon',
}

// AI 信息
export const AI_INFO = {
  model: 'glm-5',
  codingAgent: 'Claude Code (Anthropic)',
  modelProvider: 'https://bigmodel.cn/',
}

// 从后端获取应用信息
export async function getAppInfo(): Promise<AppInfo> {
  try {
    const wails = (window as any)['go']['main']['App']
    if (wails && wails['GetAppInfo']) {
      return await wails['GetAppInfo']()
    }
  } catch (e) {
    console.error('Failed to get app info:', e)
  }
  // 返回默认值
  return {
    name: APP_NAME,
    version: APP_VERSION,
    buildTime: '',
    gitCommit: '',
    goVersion: '',
    platform: '',
    author: AUTHOR_INFO.name,
    email: AUTHOR_INFO.email,
    description: '',
  }
}