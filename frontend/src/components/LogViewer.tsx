import { useState, useEffect, useRef } from 'react'
import { FolderOpen, FileText, X, Clock, HardDrive, RefreshCw, Search, ChevronDown, ChevronRight, Filter } from 'lucide-react'
import { useSettingsStore } from '../stores/settingsStore'
import { useLocale } from '../stores/localeStore'
import { api, LogFileInfo } from '../api/wails'

interface LogViewerProps {
  onClose: () => void
}

export function LogViewer({ onClose }: LogViewerProps) {
  const [logFiles, setLogFiles] = useState<LogFileInfo[]>([])
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [logContent, setLogContent] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [logDir, setLogDir] = useState('')
  const [filenameFilter, setFilenameFilter] = useState('')
  const [collapsedWeeks, setCollapsedWeeks] = useState<Set<string>>(new Set())

  // 拖拽状态
  const [position, setPosition] = useState({ x: (window.innerWidth - 1200) / 2, y: 60 })
  const [isDragging, setIsDragging] = useState(false)
  const dragOffset = useRef({ x: 0, y: 0 })

  const { getTheme } = useSettingsStore()
  const { t } = useLocale()
  const theme = getTheme()

  useEffect(() => {
    loadLogList()
    loadLogDir()
  }, [])

  // 拖拽处理
  useEffect(() => {
    if (!isDragging) return
    const handleMouseMove = (e: MouseEvent) => {
      // 限制对话框位置，确保至少有一部分在屏幕内
      const dialogWidth = Math.min(1200, window.innerWidth * 0.9)
      const minX = -dialogWidth + 100
      const maxX = window.innerWidth - 100
      const minY = 0
      const maxY = window.innerHeight - 100

      setPosition({
        x: Math.max(minX, Math.min(maxX, e.clientX - dragOffset.current.x)),
        y: Math.max(minY, Math.min(maxY, e.clientY - dragOffset.current.y)),
      })
    }
    const handleMouseUp = () => setIsDragging(false)
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging])

  const handleMouseDown = (e: React.MouseEvent) => {
    dragOffset.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    }
    setIsDragging(true)
  }

  const loadLogList = async () => {
    try {
      const files = await api.getLogList()
      setLogFiles(files)
    } catch (e) {
      console.error('Failed to load log list:', e)
    }
  }

  const loadLogDir = async () => {
    try {
      const dir = await api.getLogDir()
      setLogDir(dir)
    } catch (e) {
      console.error('Failed to get log dir:', e)
    }
  }

  const loadLogFile = async (fullPath: string) => {
    setLoading(true)
    try {
      const content = await api.readLogFile(fullPath)
      setLogContent(content)
      setSelectedFile(fullPath)
    } catch (e) {
      console.error('Failed to read log file:', e)
      setLogContent('无法读取日志文件')
    }
    setLoading(false)
  }

  const formatFileSize = (size: number) => {
    if (size < 1024) return `${size} B`
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
    return `${(size / 1024 / 1024).toFixed(1)} MB`
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleString()
  }

  // 搜索过滤日志内容
  const filteredContent = searchQuery
    ? logContent.split('\n').filter(line => line.toLowerCase().includes(searchQuery.toLowerCase())).join('\n')
    : logContent

  // 过滤日志文件（按名称）
  const filteredLogFiles = filenameFilter
    ? logFiles.filter(file => file.filename.toLowerCase().includes(filenameFilter.toLowerCase()))
    : logFiles

  // 按周分组日志文件
  const groupedFiles = filteredLogFiles.reduce((acc, file) => {
    if (!acc[file.weekDir]) {
      acc[file.weekDir] = []
    }
    acc[file.weekDir].push(file)
    return acc
  }, {} as Record<string, LogFileInfo[]>)

  // 切换周目录折叠状态
  const toggleWeekCollapse = (weekDir: string) => {
    setCollapsedWeeks(prev => {
      const newSet = new Set(prev)
      if (newSet.has(weekDir)) {
        newSet.delete(weekDir)
      } else {
        newSet.add(weekDir)
      }
      return newSet
    })
  }

  // 全部展开/折叠
  const toggleAllWeeks = () => {
    const allWeekDirs = Object.keys(groupedFiles)
    if (collapsedWeeks.size === allWeekDirs.length) {
      // 全部折叠状态 -> 全部展开
      setCollapsedWeeks(new Set())
    } else {
      // 全部展开
      setCollapsedWeeks(new Set(allWeekDirs))
    }
  }

  return (
    <div
      className="dialog-panel overflow-hidden flex flex-col"
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        width: '90vw',
        maxWidth: '1200px',
        height: '85vh',
        zIndex: 1000,
        cursor: isDragging ? 'grabbing' : 'default',
      }}
    >
      {/* 头部 - 可拖拽 */}
      <div
        className="p-4 border-b border-surface-2 flex items-center justify-between"
        style={{ cursor: 'grab', userSelect: 'none' }}
        onMouseDown={handleMouseDown}
      >
        <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
          <FolderOpen size={20} />
          {t('logs.title')}
        </h2>
        <div className="flex items-center gap-4">
          <span className="text-sm text-text-muted">
            {logDir && `${t('logs.directory')}: ${logDir}`}
          </span>
          <button
            onClick={loadLogList}
            className="p-1 hover:bg-surface-2 rounded text-text-muted"
            title={t('logs.refresh')}
            style={{ cursor: 'pointer' }}
          >
            <RefreshCw size={16} />
          </button>
          <button
            onClick={onClose}
            className="p-1 hover:bg-surface-2 rounded text-text-muted"
            style={{ cursor: 'pointer' }}
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* 主体内容 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左侧文件列表 */}
        <div
          className="w-1/3 overflow-y-auto border-r border-surface-2"
        >
          {/* 文件名过滤 */}
          <div className="px-3 py-2 flex items-center gap-2 bg-surface-2 border-b border-surface-2">
            <Filter size={14} className="text-text-muted" />
            <input
              type="text"
              value={filenameFilter}
              onChange={(e) => setFilenameFilter(e.target.value)}
              placeholder={t('logs.filenameFilter')}
              className="flex-1 px-2 py-1 text-sm outline-none rounded bg-surface-1 text-text-primary border border-surface-2"
            />
            {filenameFilter && (
              <button
                onClick={() => setFilenameFilter('')}
                className="p-1 rounded hover:bg-surface-2 text-text-muted"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* 全部展开/折叠按钮 */}
          <div className="px-3 py-1 flex items-center justify-between bg-surface-2 border-b border-surface-2">
            <span className="text-xs text-text-muted">
              {filteredLogFiles.length} {t('logs.files')}
            </span>
            <button
              onClick={toggleAllWeeks}
              className="text-xs px-2 py-1 rounded hover:bg-surface-2 text-text-muted"
            >
              {collapsedWeeks.size === Object.keys(groupedFiles).length
                ? t('logs.expandAll')
                : t('logs.collapseAll')}
            </button>
          </div>

          {Object.keys(groupedFiles).sort().reverse().map(weekDir => {
            const isCollapsed = collapsedWeeks.has(weekDir)
            const fileCount = groupedFiles[weekDir].length
            return (
              <div key={weekDir}>
                <div
                  className="px-4 py-2 text-sm font-medium flex items-center justify-between cursor-pointer hover:bg-white/5"
                  style={{
                    backgroundColor: theme.ui.surface2,
                    color: theme.ui.textMuted,
                    borderBottom: `1px solid ${theme.ui.border}`,
                  }}
                  onClick={() => toggleWeekCollapse(weekDir)}
                >
                  <div className="flex items-center gap-2">
                    {isCollapsed ? (
                      <ChevronRight size={14} />
                    ) : (
                      <ChevronDown size={14} />
                    )}
                    <FolderOpen size={14} />
                    <span>{weekDir}</span>
                  </div>
                  <span className="text-xs" style={{ color: theme.ui.textMuted }}>
                    {fileCount}
                  </span>
                </div>
                {!isCollapsed && groupedFiles[weekDir].map(file => (
                  <button
                    key={file.fullPath}
                    onClick={() => loadLogFile(file.fullPath)}
                    className="w-full px-4 py-2 flex items-center gap-2 text-left transition-colors"
                    style={{
                      backgroundColor: selectedFile === file.fullPath
                        ? theme.ui.accent + '20'
                        : 'transparent',
                      color: theme.ui.textPrimary,
                      borderBottom: `1px solid ${theme.ui.border}`,
                    }}
                  >
                    <FileText size={14} style={{ color: theme.ui.textMuted }} />
                    <div className="flex-1 truncate">
                      <div className="text-sm truncate">{file.filename}</div>
                      <div
                        className="text-xs flex items-center gap-2 mt-1"
                        style={{ color: theme.ui.textMuted }}
                      >
                        <Clock size={12} />
                        <span>{formatDate(file.modifiedTime)}</span>
                        <HardDrive size={12} />
                        <span>{formatFileSize(file.size)}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )
          })}

          {filteredLogFiles.length === 0 && (
            <div
              className="flex flex-col items-center justify-center py-12"
              style={{ color: theme.ui.textMuted }}
            >
              <FileText size={48} className="mb-4 opacity-50" />
              <span>{filenameFilter ? t('logs.noMatch') : t('logs.noLogs')}</span>
            </div>
          )}
        </div>

        {/* 右侧日志内容 */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* 搜索栏 */}
          <div
            className="flex items-center gap-2 px-4 py-2"
            style={{
              backgroundColor: theme.ui.surface2,
              borderBottom: `1px solid ${theme.ui.border}`,
            }}
          >
            <Search size={16} style={{ color: theme.ui.textMuted }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('logs.searchPlaceholder')}
              className="flex-1 px-2 py-1 text-sm outline-none rounded"
              style={{
                backgroundColor: theme.ui.surface1,
                color: theme.ui.textPrimary,
                border: `1px solid ${theme.ui.border}`,
              }}
            />
            {searchQuery && (
              <span
                className="text-xs"
                style={{ color: theme.ui.textMuted }}
              >
                {filteredContent.split('\n').length} / {logContent.split('\n').length} lines
              </span>
            )}
          </div>

          {/* 日志内容显示 */}
          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <div
                className="flex items-center justify-center h-full"
                style={{ color: theme.ui.textMuted }}
              >
                {t('logs.loading')}
              </div>
            ) : selectedFile ? (
              <pre
                className="text-sm whitespace-pre-wrap font-mono"
                style={{
                  color: theme.ui.textPrimary,
                  backgroundColor: theme.ui.surface1,
                  lineHeight: 1.6,
                }}
              >
                {filteredContent || t('logs.noResults')}
              </pre>
            ) : (
              <div
                className="flex flex-col items-center justify-center h-full"
                style={{ color: theme.ui.textMuted }}
              >
                <FileText size={64} className="mb-4 opacity-30" />
                <span>{t('logs.selectFile')}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}