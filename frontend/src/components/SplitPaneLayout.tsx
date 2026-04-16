import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { TerminalPane } from './TerminalPane'
import { SplitDirection, useTerminalStore, type PaneNode } from '../stores/terminalStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useLocale } from '../stores/localeStore'
import { getAllPaneIds } from '../utils/paneUtils'
import { X, Columns, Rows } from 'lucide-react'

interface Props {
  tabId: string
  node: PaneNode
  isActiveTab: boolean
  activePaneId: string
  onPaneClick: (paneId: string) => void
}

// 获取分屏树中的 pane 数量
function getPaneCount(node: PaneNode): number {
  if (node.type === 'pane') return 1
  return getPaneCount(node.children[0]) + getPaneCount(node.children[1])
}

// Pane 组件 - 不使用 memo，依赖 wrapper div 的 key 来控制 fiber 的稳定性
// 当 wrapper div 的 key (pane.id) 相同时，React 保留 fiber，只更新 props
// PaneComponent 重新渲染不会导致 TerminalPane 的 useEffect cleanup 执行（cleanup 只在组件卸载时执行）
interface PaneProps {
  tabId: string
  paneId: string
  sessionId: string
  isActive: boolean
  canClose: boolean
  canSplit: boolean
  onPaneClick: (paneId: string) => void
  onClosePane: (paneId: string) => void
  onSplitPane: (paneId: string, direction: SplitDirection) => void
}

function PaneComponent({
  tabId,
  paneId,
  isActive,
  canClose,
  canSplit,
  onPaneClick,
  onClosePane,
  onSplitPane
}: PaneProps) {
  const { getTheme } = useSettingsStore()
  const { t } = useLocale()
  const theme = getTheme()
  const [showPaneMenu, setShowPaneMenu] = useState(false)

  return (
    <div
      className="relative h-full w-full group"
      onClick={() => onPaneClick(paneId)}
      style={{
        outline: isActive ? `2px solid ${theme.ui.accent}` : 'none',
        outlineOffset: '-2px'
      }}
    >
      <TerminalPane tabId={tabId} paneId={paneId} isActive={isActive} />

      {/* 分屏工具栏 */}
      <div
        className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-20"
        onClick={e => e.stopPropagation()}
      >
        {/* 分屏按钮 */}
        {canSplit && (
          <div className="relative">
            <button
              onClick={() => setShowPaneMenu(!showPaneMenu)}
              className="p-1 rounded hover:bg-white/10"
              style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
              title={t('tabBar.splitVertical')}
            >
              <Columns size={14} style={{ color: '#fff' }} />
            </button>
            {showPaneMenu && (
              <div
                className="absolute right-0 top-full mt-1 rounded-lg shadow-lg overflow-hidden min-w-[120px]"
                style={{ backgroundColor: theme.ui.surface1, border: `1px solid ${theme.ui.border}` }}
              >
                <div
                  className="px-3 py-2 text-sm cursor-pointer hover:bg-white/10 flex items-center gap-2"
                  style={{ color: theme.ui.textPrimary }}
                  onClick={() => { onSplitPane(paneId, 'horizontal'); setShowPaneMenu(false) }}
                >
                  <Columns size={14} />
                  {t('tabBar.splitVertical')}
                </div>
                <div
                  className="px-3 py-2 text-sm cursor-pointer hover:bg-white/10 flex items-center gap-2"
                  style={{ color: theme.ui.textPrimary }}
                  onClick={() => { onSplitPane(paneId, 'vertical'); setShowPaneMenu(false) }}
                >
                  <Rows size={14} />
                  {t('tabBar.splitHorizontal')}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 关闭按钮 */}
        {canClose && (
          <button
            onClick={() => onClosePane(paneId)}
            className="p-1 rounded hover:bg-red-500/50"
            style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
            title={t('tabBar.closePane')}
          >
            <X size={14} style={{ color: '#fff' }} />
          </button>
        )}
      </div>
    </div>
  )
}

// 分屏布局组件 - 不使用 memo，依赖内部的 PaneComponent 的稳定性
export function SplitPaneLayout({ tabId, node, isActiveTab, activePaneId, onPaneClick }: Props) {
  const { getTheme } = useSettingsStore()
  const { closePane, splitPane, getPaneCount: storeGetPaneCount } = useTerminalStore()
  const theme = getTheme()
  const containerRef = useRef<HTMLDivElement>(null)

  // 获取当前 tab 的所有 pane ID，用于判断关闭/分屏权限
  const paneIds = useMemo(() => getAllPaneIds(node), [node])
  const paneCount = paneIds.length

  // 处理关闭分屏
  const handleClosePane = useCallback((paneId: string) => {
    closePane(tabId, paneId)
  }, [tabId, closePane])

  // 处理分屏
  const handleSplitPane = useCallback((paneId: string, direction: SplitDirection) => {
    splitPane(tabId, paneId, direction)
  }, [tabId, splitPane])

  // 稳定的 onPaneClick 回调
  const handlePaneClick = useCallback((paneId: string) => {
    onPaneClick(paneId)
  }, [onPaneClick])

  // 递归渲染节点
  // 关键策略：
  // - 使用位置相关的固定 key，确保创建/关闭分屏时 key 保持稳定
  // - PaneComponent 始终被 content div 包装，使用 pane.id 作为 key
  const renderNode = useCallback((currentNode: PaneNode, depth: number = 0, position: 'root' | 'left' | 'right' = 'root'): React.ReactNode => {
    if (currentNode.type === 'pane') {
      const isActivePane = activePaneId === currentNode.id && isActiveTab
      const canClose = paneCount > 1
      const canSplit = paneCount < 6

      // 使用 position 作为 wrapper key，确保结构变化时 key 保持稳定
      const wrapperKey = position

      return (
        <div key={wrapperKey} className="relative h-full w-full">
          <div key={currentNode.id} className="h-full w-full">
            <PaneComponent
              paneId={currentNode.id}
              tabId={tabId}
              sessionId={currentNode.sessionId}
              isActive={isActivePane}
              canClose={canClose}
              canSplit={canSplit}
              onPaneClick={handlePaneClick}
              onClosePane={handleClosePane}
              onSplitPane={handleSplitPane}
            />
          </div>
        </div>
      )
    }

    // split 类型 - 渲染分隔布局
    const isHorizontal = currentNode.direction === 'horizontal'
    const [leftChild, rightChild] = currentNode.children

    // 使用 position 作为 wrapper key，确保结构变化时 key 保持稳定
    const wrapperKey = position

    // 渲染子节点内容
    // 使用固定的 'left-content' 和 'right-content' 作为 key
    const renderChildContent = (child: PaneNode, childPosition: 'left' | 'right'): React.ReactNode => {
      const contentKey = `${childPosition}-content`

      if (child.type === 'pane') {
        const isActivePane = activePaneId === child.id && isActiveTab
        const canClose = paneCount > 1
        const canSplit = paneCount < 6
        return (
          <div key={contentKey} className="h-full w-full">
            <PaneComponent
              paneId={child.id}
              tabId={tabId}
              sessionId={child.sessionId}
              isActive={isActivePane}
              canClose={canClose}
              canSplit={canSplit}
              onPaneClick={handlePaneClick}
              onClosePane={handleClosePane}
              onSplitPane={handleSplitPane}
            />
          </div>
        )
      } else {
        // 子节点是 split，递归渲染，传递位置信息
        return (
          <div key={contentKey} className="h-full w-full">
            {renderNode(child, depth + 2, childPosition)}
          </div>
        )
      }
    }

    return (
      <div
        key={wrapperKey}
        className="h-full w-full flex"
        style={{
          flexDirection: isHorizontal ? 'row' : 'column'
        }}
      >
        {/* 左侧容器 - 使用固定 key 'left-container' */}
        <div key="left-container" style={{ flex: `0 0 ${currentNode.ratio * 100}%`, overflow: 'hidden' }}>
          {renderChildContent(leftChild, 'left')}
        </div>
        {/* 分隔条 */}
        <div
          key="separator"
          className="flex-shrink-0 hover:opacity-80 transition-opacity"
          style={{
            width: isHorizontal ? 4 : '100%',
            height: isHorizontal ? '100%' : 4,
            backgroundColor: theme.ui.border,
            cursor: 'pointer'
          }}
        />
        {/* 右侧容器 - 使用固定 key 'right-container' */}
        <div key="right-container" style={{ flex: `0 0 ${(1 - currentNode.ratio) * 100}%`, overflow: 'hidden' }}>
          {renderChildContent(rightChild, 'right')}
        </div>
      </div>
    )
  }, [activePaneId, isActiveTab, paneCount, tabId, handlePaneClick, handleClosePane, handleSplitPane, theme.ui.border])

  return (
    <div ref={containerRef} className="h-full w-full">
      {renderNode(node)}
    </div>
  )
}