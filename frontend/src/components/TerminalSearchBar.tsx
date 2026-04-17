import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, ChevronUp, ChevronDown, X, CaseSensitive, WholeWord, Regex } from 'lucide-react'
import { SearchAddon } from '@xterm/addon-search'
import { useSettingsStore } from '../stores/settingsStore'
import { useLocale } from '../stores/localeStore'

interface TerminalSearchBarProps {
  paneId: string
  searchAddon: SearchAddon | null
  onClose: () => void
  position: 'top' | 'bottom'
  terminalBackground: string
}

export function TerminalSearchBar({ searchAddon, onClose, position, terminalBackground }: TerminalSearchBarProps) {
  const [query, setQuery] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [useRegex, setUseRegex] = useState(false)
  const [matchCount, setMatchCount] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const { getTheme } = useSettingsStore()
  const { t } = useLocale()
  const theme = getTheme()

  // 搜索装饰配置 - 高亮匹配项
  const searchDecorations = {
    matchBackground: '#FFFF00',  // 黄色背景高亮匹配
    matchOverviewRuler: '#FFFF00',
    activeMatchBackground: '#FFA500',  // 橙色背景高亮当前匹配
    activeMatchColorOverviewRuler: '#FFA500',
  }

  // 获取搜索选项
  const getSearchOptions = useCallback(() => ({
    caseSensitive,
    wholeWord,
    regex: useRegex,
    decorations: searchDecorations,
  }), [caseSensitive, wholeWord, useRegex])

  // 自动聚焦
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // 监听搜索结果变化
  useEffect(() => {
    if (!searchAddon) return

    const disposable = searchAddon.onDidChangeResults((result) => {
      if (result && typeof result.resultCount === 'number') {
        setMatchCount(result.resultCount)
      }
    })

    return () => disposable.dispose()
  }, [searchAddon])

  // 执行搜索
  const doSearch = useCallback((searchQuery: string) => {
    if (!searchAddon) {
      return
    }

    if (!searchQuery) {
      setMatchCount(0)
      searchAddon.clearDecorations()
      return
    }

    searchAddon.findNext(searchQuery, getSearchOptions())
  }, [searchAddon, getSearchOptions])

  // 查询变化时搜索
  useEffect(() => {
    doSearch(query)
  }, [query, doSearch])

  // 查找下一个
  const findNext = useCallback(() => {
    if (!searchAddon || !query) return
    searchAddon.findNext(query, getSearchOptions())
  }, [searchAddon, query, getSearchOptions])

  // 查找上一个
  const findPrevious = useCallback(() => {
    if (!searchAddon || !query) return
    searchAddon.findPrevious(query, getSearchOptions())
  }, [searchAddon, query, getSearchOptions])

  // 键盘快捷键
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey) {
        findPrevious()
      } else {
        findNext()
      }
    } else if (e.key === 'Escape') {
      // 清除装饰并关闭
      if (searchAddon) {
        searchAddon.clearDecorations()
      }
      onClose()
    }
  }

  // 关闭时清除装饰
  const handleClose = () => {
    if (searchAddon) {
      searchAddon.clearDecorations()
    }
    onClose()
  }

  const isTop = position === 'top'

  return (
    <div
      className="flex items-center gap-2 px-3 py-2"
      style={{
        backgroundColor: terminalBackground,
        borderBottom: isTop ? `1px solid ${theme.ui.border}` : 'none',
        borderTop: isTop ? 'none' : `1px solid ${theme.ui.border}`,
      }}
    >
      {/* 搜索图标 */}
      <Search size={16} style={{ color: theme.ui.textMuted }} />

      {/* 搜索输入框 */}
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t('search.placeholder')}
        className="flex-1 px-2 py-1 text-sm outline-none"
        style={{
          backgroundColor: theme.ui.surface1,
          color: theme.ui.textPrimary,
          border: `1px solid ${theme.ui.border}`,
          borderRadius: '4px',
        }}
      />

      {/* 匹配计数 */}
      <span
        className="text-xs min-w-[50px] text-center"
        style={{ color: theme.ui.textMuted }}
      >
        {matchCount > 0 ? `${matchCount} matches` : t('search.noResults')}
      </span>

      {/* 选项按钮 */}
      <button
        onClick={() => setCaseSensitive(!caseSensitive)}
        className="p-1 rounded transition-colors"
        style={{
          backgroundColor: caseSensitive ? theme.ui.accent : 'transparent',
          color: caseSensitive ? '#fff' : theme.ui.textMuted,
        }}
        title={t('search.caseSensitive')}
      >
        <CaseSensitive size={16} />
      </button>

      <button
        onClick={() => setWholeWord(!wholeWord)}
        className="p-1 rounded transition-colors"
        style={{
          backgroundColor: wholeWord ? theme.ui.accent : 'transparent',
          color: wholeWord ? '#fff' : theme.ui.textMuted,
        }}
        title={t('search.wholeWord')}
      >
        <WholeWord size={16} />
      </button>

      <button
        onClick={() => setUseRegex(!useRegex)}
        className="p-1 rounded transition-colors"
        style={{
          backgroundColor: useRegex ? theme.ui.accent : 'transparent',
          color: useRegex ? '#fff' : theme.ui.textMuted,
        }}
        title={t('search.regex')}
      >
        <Regex size={16} />
      </button>

      {/* 分隔线 */}
      <div style={{ width: 1, height: 20, backgroundColor: theme.ui.border }} />

      {/* 上一个/下一个 */}
      <button
        onClick={findPrevious}
        disabled={!query}
        className="p-1 rounded transition-colors disabled:opacity-50"
        style={{ color: theme.ui.textPrimary }}
        title={t('search.previous')}
      >
        <ChevronUp size={16} />
      </button>

      <button
        onClick={findNext}
        disabled={!query}
        className="p-1 rounded transition-colors disabled:opacity-50"
        style={{ color: theme.ui.textPrimary }}
        title={t('search.next')}
      >
        <ChevronDown size={16} />
      </button>

      {/* 关闭按钮 */}
      <button
        onClick={handleClose}
        className="p-1 rounded transition-colors hover:bg-white/10"
        style={{ color: theme.ui.textMuted }}
        title={t('common.close')}
      >
        <X size={16} />
      </button>
    </div>
  )
}