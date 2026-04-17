import { create } from 'zustand'
import { getFirstPane, getAllPaneIds, type PaneNode, type SplitDirection } from '../utils/paneUtils'

// 重导出类型供其他组件使用
export type { PaneNode, SplitDirection } from '../utils/paneUtils'

// 最大分屏数量
const MAX_PANE_COUNT = 6

// 标签页
export interface Tab {
  id: string
  rootPane: PaneNode  // 根分屏节点（可以是单个 pane 或 split）
  activePaneId: string // 当前活动的 pane ID
}

interface State {
  tabs: Tab[]
  activeTabId: string | null
  cursorPositions: Record<string, { row: number; col: number }> // 光标位置，key 为 paneId
  createTab: (sessionId: string, title: string, forceNew?: boolean) => string
  closeTab: (tabId: string) => void
  closePane: (tabId: string, paneId: string) => void
  setActiveTab: (tabId: string | null) => void
  setActivePane: (tabId: string, paneId: string) => void
  getTab: (tabId: string) => Tab | undefined
  getPane: (tabId: string, paneId: string) => PaneNode | undefined
  getActivePane: (tabId: string) => PaneNode | undefined
  getPaneCount: (tabId: string) => number
  splitPane: (tabId: string, paneId: string, direction: SplitDirection) => string | null
  updatePaneSize: (tabId: string, paneId: string, cols: number, rows: number) => void
  updateCursorPosition: (paneId: string, row: number, col: number) => void
  getTabBySessionId: (sessionId: string) => Tab | undefined
}

const genId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

// 在节点树中查找特定 pane
function findPane(node: PaneNode, paneId: string): PaneNode | undefined {
  if (node.type === 'pane') {
    return node.id === paneId ? node : undefined
  }
  const left = findPane(node.children[0], paneId)
  if (left) return left
  return findPane(node.children[1], paneId)
}

// 在节点树中替换特定 pane
function replacePane(node: PaneNode, paneId: string, newNode: PaneNode): PaneNode {
  if (node.type === 'pane') {
    return node.id === paneId ? newNode : node
  }
  return {
    ...node,
    children: [
      replacePane(node.children[0], paneId, newNode),
      replacePane(node.children[1], paneId, newNode)
    ]
  }
}

// 在节点树中删除特定 pane，返回删除后的树
// 如果只剩一个 pane，返回那个 pane；如果树被完全删除，返回 null
function removePane(node: PaneNode, paneId: string): PaneNode | null {
  if (node.type === 'pane') {
    return node.id === paneId ? null : node
  }
  const left = removePane(node.children[0], paneId)
  const right = removePane(node.children[1], paneId)

  if (!left && !right) return null
  if (!left) return right
  if (!right) return left
  return { ...node, children: [left, right] }
}

export const useTerminalStore = create<State>((set, get) => ({
  tabs: [],
  activeTabId: null,
  cursorPositions: {},

  createTab: (sessionId, title, forceNew = false) => {
    // 如果 forceNew 为 false 且该会话的标签页已存在，切换到那个标签页
    if (!forceNew) {
      const existing = get().tabs.find(t => {
        const firstPane = getFirstPane(t.rootPane)
        return firstPane.type === 'pane' && firstPane.sessionId === sessionId
      })
      if (existing) {
        set({ activeTabId: existing.id })
        return existing.id  // 返回 tabId
      }
    }

    // 创建新标签页，paneId 作为独立的连接ID
    const tabId = `tab-${genId()}`
    const paneId = `pane-${genId()}`
    const rootPane: PaneNode = {
      type: 'pane',
      id: paneId,
      sessionId,
      title,
      cols: 80,
      rows: 24
    }

    set(s => ({
      tabs: [...s.tabs, { id: tabId, rootPane, activePaneId: paneId }],
      activeTabId: tabId
    }))
    return tabId // 返回 tabId 用于 renderedTabsRef
  },

  closeTab: (tabId) => set(s => {
    const tabs = s.tabs.filter(t => t.id !== tabId)
    const newActiveTabId = s.activeTabId === tabId ? (tabs[0]?.id || null) : s.activeTabId
    return {
      tabs,
      activeTabId: newActiveTabId
    }
  }),

  closePane: (tabId, paneId) => set(s => {
    const tab = s.tabs.find(t => t.id === tabId)
    if (!tab) return s

    const newRootPane = removePane(tab.rootPane, paneId)
    if (!newRootPane) {
      // 如果删除后没有 pane，关闭整个 tab
      const tabs = s.tabs.filter(t => t.id !== tabId)
      const newActiveTabId = s.activeTabId === tabId ? (tabs[0]?.id || null) : s.activeTabId
      return { tabs, activeTabId: newActiveTabId }
    }

    // 获取剩余的 pane IDs，选择一个作为活动 pane
    const remainingPaneIds = getAllPaneIds(newRootPane)
    const newActivePaneId = remainingPaneIds.includes(tab.activePaneId)
      ? tab.activePaneId
      : remainingPaneIds[0]

    return {
      tabs: s.tabs.map(t => t.id === tabId
        ? { ...t, rootPane: newRootPane, activePaneId: newActivePaneId }
        : t
      )
    }
  }),

  setActiveTab: (tabId) => set({ activeTabId: tabId }),

  setActivePane: (tabId, paneId) => set(s => ({
    tabs: s.tabs.map(t => t.id === tabId ? { ...t, activePaneId: paneId } : t)
  })),

  getTab: (tabId) => get().tabs.find(t => t.id === tabId),

  getPane: (tabId, paneId) => {
    const tab = get().tabs.find(t => t.id === tabId)
    if (!tab) return undefined
    return findPane(tab.rootPane, paneId)
  },

  getActivePane: (tabId) => {
    const tab = get().tabs.find(t => t.id === tabId)
    if (!tab) return undefined
    return findPane(tab.rootPane, tab.activePaneId)
  },

  getPaneCount: (tabId) => {
    const tab = get().tabs.find(t => t.id === tabId)
    if (!tab) return 0
    return getAllPaneIds(tab.rootPane).length
  },

  splitPane: (tabId, paneId, direction) => {
    const tab = get().tabs.find(t => t.id === tabId)
    if (!tab) return null

    // 检查分屏数量是否已达上限
    const currentPaneCount = getAllPaneIds(tab.rootPane).length
    if (currentPaneCount >= MAX_PANE_COUNT) {
      console.warn(`[Terminal] Maximum pane count (${MAX_PANE_COUNT}) reached`)
      return null
    }

    const existingPane = findPane(tab.rootPane, paneId)
    if (!existingPane || existingPane.type !== 'pane') return null

    // 创建新的 pane
    const newPaneId = `pane-${genId()}`
    const newPane: PaneNode = {
      type: 'pane',
      id: newPaneId,
      sessionId: existingPane.sessionId,
      title: existingPane.title,
      cols: existingPane.cols,
      rows: existingPane.rows
    }

    // 创建新的 split 节点替换原来的 pane，split 也有唯一 ID
    const splitNode: PaneNode = {
      type: 'split',
      id: `split-${genId()}`,
      direction,
      children: [existingPane, newPane],
      ratio: 0.5
    }

    const newRootPane = replacePane(tab.rootPane, paneId, splitNode)

    set(s => ({
      tabs: s.tabs.map(t => t.id === tabId
        ? { ...t, rootPane: newRootPane, activePaneId: newPaneId }
        : t
      )
    }))

    return newPaneId
  },

  updatePaneSize: (tabId, paneId, cols, rows) => set(s => {
    const tab = s.tabs.find(t => t.id === tabId)
    if (!tab) return s

    const pane = findPane(tab.rootPane, paneId)
    if (!pane || pane.type !== 'pane') return s

    const newRootPane = replacePane(tab.rootPane, paneId, {
      ...pane,
      cols,
      rows
    })

    return {
      tabs: s.tabs.map(t => t.id === tabId ? { ...t, rootPane: newRootPane } : t)
    }
  }),

  updateCursorPosition: (paneId, row, col) => set(s => ({
    cursorPositions: { ...s.cursorPositions, [paneId]: { row, col } }
  })),

  getTabBySessionId: (sessionId) => {
    const tabs = get().tabs
    return tabs.find(t => {
      const firstPane = getFirstPane(t.rootPane)
      return firstPane.type === 'pane' && firstPane.sessionId === sessionId
    })
  },
}))