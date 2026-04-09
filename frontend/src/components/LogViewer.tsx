import { useState, useEffect } from 'react'
import { FolderOpen, FileText, X, Clock, HardDrive, RefreshCw, Search } from 'lucide-react'
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

  const { getTheme } = useSettingsStore()
  const { t } = useLocale()
  const theme = getTheme()

  useEffect(() => {
    loadLogList()
    loadLogDir()
  }, [])

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

  // 按周分组日志文件
  const groupedFiles = logFiles.reduce((acc, file) => {
    if (!acc[file.weekDir]) {
      acc[file.weekDir] = []
    }
    acc[file.weekDir].push(file)
    return acc
  }, {} as Record<string, LogFileInfo[]>)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
    >
      <div
        className="flex flex-col rounded-lg shadow-xl overflow-hidden"
        style={{
          backgroundColor: theme.ui.surface1,
          width: '90vw',
          maxWidth: '1200px',
          height: '85vh',
        }}
      >
        {/* 头部 */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{
            backgroundColor: theme.ui.surface2,
            borderBottom: `1px solid ${theme.ui.border}`,
          }}
        >
          <div className="flex items-center gap-3">
            <FolderOpen size={20} style={{ color: theme.ui.textPrimary }} />
            <h2 className="text-lg font-medium" style={{ color: theme.ui.textPrimary }}>
              {t('logs.title')}
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <span
              className="text-sm"
              style={{ color: theme.ui.textMuted }}
            >
              {logDir && `${t('logs.directory')}: ${logDir}`}
            </span>
            <button
              onClick={loadLogList}
              className="p-2 rounded transition-colors hover:bg-white/10"
              style={{ color: theme.ui.textMuted }}
              title={t('logs.refresh')}
            >
              <RefreshCw size={16} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded transition-colors hover:bg-white/10"
              style={{ color: theme.ui.textMuted }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* 主体内容 */}
        <div className="flex flex-1 overflow-hidden">
          {/* 左侧文件列表 */}
          <div
            className="w-1/3 overflow-y-auto"
            style={{
              borderRight: `1px solid ${theme.ui.border}`,
              backgroundColor: theme.ui.surface1,
            }}
          >
            {Object.keys(groupedFiles).sort().reverse().map(weekDir => (
              <div key={weekDir}>
                <div
                  className="px-4 py-2 text-sm font-medium"
                  style={{
                    backgroundColor: theme.ui.surface2,
                    color: theme.ui.textMuted,
                    borderBottom: `1px solid ${theme.ui.border}`,
                  }}
                >
                  <FolderOpen size={14} className="inline mr-2" />
                  {weekDir}
                </div>
                {groupedFiles[weekDir].map(file => (
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
            ))}

            {logFiles.length === 0 && (
              <div
                className="flex flex-col items-center justify-center py-12"
                style={{ color: theme.ui.textMuted }}
              >
                <FileText size={48} className="mb-4 opacity-50" />
                <span>{t('logs.noLogs')}</span>
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
    </div>
  )
}