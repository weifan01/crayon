import { api } from '../api/wails'
import type { PaneNode } from '../stores/terminalStore'

// 重导出 PaneNode 类型供其他组件使用
export type { PaneNode } from '../stores/terminalStore'

// Pane 类型 - 用于获取 pane 特定属性
type PaneType = Extract<PaneNode, { type: 'pane' }>

// 获取第一个 pane 节点（用于获取活动终端）
export function getFirstPane(node: PaneNode): PaneType {
  if (node.type === 'pane') return node
  return getFirstPane(node.children[0])
}

// 获取所有 pane ID（用于批量操作）
export function getAllPaneIds(node: PaneNode): string[] {
  if (node.type === 'pane') return [node.id]
  return [...getAllPaneIds(node.children[0]), ...getAllPaneIds(node.children[1])]
}

// 获取所有 pane 的 sessionId（用于获取所有连接的会话）
export function getAllPaneSessionIds(node: PaneNode): string[] {
  if (node.type === 'pane') {
    return node.sessionId ? [node.sessionId] : []
  }
  return [...getAllPaneSessionIds(node.children[0]), ...getAllPaneSessionIds(node.children[1])]
}

// 检查 pane 是否存在于树中
export function paneExistsInTree(node: PaneNode, targetPaneId: string): boolean {
  if (node.type === 'pane') return node.id === targetPaneId
  return paneExistsInTree(node.children[0], targetPaneId) || paneExistsInTree(node.children[1], targetPaneId)
}

// MIME 类型映射 - 统一处理图片类型
const imageMimeTypes: Record<string, string> = {
  'png': 'image/png',
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'gif': 'image/gif',
  'webp': 'image/webp',
  'bmp': 'image/bmp',
}

// 获取图片 MIME 类型
export function getImageMimeType(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop()
  return imageMimeTypes[ext || ''] || 'image/png'
}

// 加载图片为 base64 URL（统一处理背景图片加载）
export async function loadImageAsBase64Url(filename: string): Promise<string> {
  if (!filename) return ''
  try {
    const base64Data = await api.loadBackgroundImage(filename)
    return `data:${getImageMimeType(filename)};base64,${base64Data}`
  } catch (e) {
    console.error('Failed to load image:', e)
    return ''
  }
}