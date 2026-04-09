import { useEffect, useRef, useMemo, useState, useCallback } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { WebLinksAddon } from 'xterm-addon-web-links'
import { SearchAddon } from '@xterm/addon-search'
import 'xterm/css/xterm.css'
import { useSessionStore } from '../stores/sessionStore'
import { useTerminalStore } from '../stores/terminalStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useLocale } from '../stores/localeStore'
import { api } from '../api/wails'
import { TerminalSearchBar } from './TerminalSearchBar'

declare global {
  interface Window {
    runtime: {
      EventsOn: (event: string, callback: (...args: any[]) => void) => void
      EventsOff: (event: string) => void
    }
  }
}

interface Props { tabId: string; paneId: string; isActive: boolean }

// 辅助函数：在节点树中查找 pane 的 sessionId
function findPaneSessionId(node: any, targetPaneId: string): string | undefined {
  if (node.type === 'pane') {
    return node.id === targetPaneId ? node.sessionId : undefined
  }
  if (node.children) {
    return findPaneSessionId(node.children[0], targetPaneId) || findPaneSessionId(node.children[1], targetPaneId)
  }
  return undefined
}

// 辅助函数：检查 paneId 是否存在于节点树中
function paneExistsInTree(node: any, targetPaneId: string): boolean {
  if (node.type === 'pane') {
    return node.id === targetPaneId
  }
  if (node.children) {
    return paneExistsInTree(node.children[0], targetPaneId) || paneExistsInTree(node.children[1], targetPaneId)
  }
  return false
}

// 全局终端缓存 - 用于组件重新挂载时恢复终端
interface TerminalCache {
  terminal: Terminal
  fitAddon: FitAddon
  searchAddon: SearchAddon
  dataBuffer: string[]
  eventsRegistered: boolean
}

const terminalCache = new Map<string, TerminalCache>()

export function TerminalPane({ tabId, paneId, isActive }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const searchAddonRef = useRef<SearchAddon | null>(null)
  const dataBufferRef = useRef<string[]>([])
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const [terminalReady, setTerminalReady] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [searchAddonReady, setSearchAddonReady] = useState(false)
  // 标记是否已注册事件监听
  const eventsRegisteredRef = useRef(false)

  const { connectTab, disconnectTab, getTabStatus, setTabStatus, sendToTab, resizeTab } = useSessionStore()
  const { getTerminalTheme, getTheme, terminalSettings, currentTheme } = useSettingsStore()
  const { t } = useLocale()
  const localEchoRef = useRef<boolean>(true) // 默认启用本地回显，等待协商结果

  // 使用 selector 获取 sessionId
  const sessionId = useTerminalStore(state => {
    const tab = state.tabs.find(t => t.id === tabId)
    if (!tab) return undefined
    return findPaneSessionId(tab.rootPane, paneId)
  })

  // 获取终端主题
  const terminalTheme = useMemo(() => getTerminalTheme(), [currentTheme, getTerminalTheme])
  const appTheme = useMemo(() => getTheme(), [currentTheme, getTheme])

  // paneId 作为连接标识符
  const connectionId = paneId

  // 用于重连时获取最新的 sessionId
  const getPaneSessionId = useCallback(() => {
    const state = useTerminalStore.getState()
    const tab = state.tabs.find(t => t.id === tabId)
    if (!tab) return undefined
    return findPaneSessionId(tab.rootPane, paneId)
  }, [tabId, paneId])

  // 处理缓冲的数据
  const flushBuffer = () => {
    if (termRef.current && dataBufferRef.current.length > 0) {
      dataBufferRef.current.forEach(data => {
        termRef.current!.write(data)
      })
      dataBufferRef.current = []
    }
  }

  // 复制选中文本到剪贴板
  const copySelection = async (term: Terminal) => {
    const selection = term.getSelection()
    if (selection) {
      try {
        await api.clipboardWrite(selection)
      } catch (e) {
        console.error('Failed to copy:', e)
      }
    }
  }

  // 从剪贴板粘贴
  const pasteFromClipboard = async () => {
    try {
      const text = await api.clipboardRead()
      if (text && termRef.current) {
        const status = getTabStatus(connectionId)
        if (status === 'connected') {
          sendToTab(connectionId, text)
        }
      }
    } catch (e) {
      console.error('Failed to paste:', e)
    }
  }

  // 调整终端大小
  const handleResize = useCallback(() => {
    if (fitRef.current && termRef.current && ref.current) {
      const rect = ref.current.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return

      const oldCols = termRef.current.cols
      const oldRows = termRef.current.rows

      try {
        fitRef.current.fit()
      } catch (e) {
        console.error('Fit failed:', e)
        return
      }

      const newCols = termRef.current.cols
      const newRows = termRef.current.rows

      if (newCols !== oldCols || newRows !== oldRows) {
        const status = getTabStatus(connectionId)
        if (status === 'connected') {
          resizeTab(connectionId, newCols, newRows)
        }
      }
    }
  }, [connectionId, getTabStatus, resizeTab])

  // 初始化终端 - 使用缓存机制避免重新挂载时重新连接
  useEffect(() => {
    if (!ref.current) return

    let terminalElement: HTMLElement | null = null

    // 检查缓存中是否有该 paneId 的终端实例
    const cached = terminalCache.get(paneId)

    if (cached) {
      termRef.current = cached.terminal
      fitRef.current = cached.fitAddon
      searchAddonRef.current = cached.searchAddon
      dataBufferRef.current = cached.dataBuffer
      eventsRegisteredRef.current = cached.eventsRegistered
      setSearchAddonReady(true)

      terminalElement = cached.terminal.element
      if (terminalElement && ref.current) {
        ref.current.innerHTML = ''
        ref.current.appendChild(terminalElement)
        requestAnimationFrame(() => {
          fitRef.current?.fit()
          // 如果是活动标签页，聚焦终端
          if (isActive && termRef.current) {
            termRef.current.focus()
          }
        })
      }

      setTerminalReady(true)
    } else {

      const term = new Terminal({
        theme: {
          background: terminalTheme.colors.background,
          foreground: terminalTheme.colors.foreground,
          cursor: terminalTheme.colors.cursor,
          selectionBackground: terminalTheme.colors.selectionBackground,
          black: terminalTheme.colors.black,
          red: terminalTheme.colors.red,
          green: terminalTheme.colors.green,
          yellow: terminalTheme.colors.yellow,
          blue: terminalTheme.colors.blue,
          magenta: terminalTheme.colors.magenta,
          cyan: terminalTheme.colors.cyan,
          white: terminalTheme.colors.white,
          brightBlack: terminalTheme.colors.brightBlack,
          brightRed: terminalTheme.colors.brightRed,
          brightGreen: terminalTheme.colors.brightGreen,
          brightYellow: terminalTheme.colors.brightYellow,
          brightBlue: terminalTheme.colors.brightBlue,
          brightMagenta: terminalTheme.colors.brightMagenta,
          brightCyan: terminalTheme.colors.brightCyan,
          brightWhite: terminalTheme.colors.brightWhite,
        },
        fontFamily: terminalSettings.fontFamily,
        fontSize: terminalSettings.fontSize,
        lineHeight: 1.2,
        letterSpacing: 0,
        cursorBlink: true,
        cursorStyle: 'block',
        scrollback: 10000,
        allowProposedApi: true,
        convertEol: true,
        disableStdin: false,
        allowTransparency: true,
        scrollOnUserInput: true,
      })

      const fit = new FitAddon()
      const searchAddon = new SearchAddon()
      term.loadAddon(fit)
      term.loadAddon(searchAddon)
      term.loadAddon(new WebLinksAddon())

      // 配置搜索装饰
      searchAddon.clearDecorations()

      term.open(ref.current)

      termRef.current = term
      fitRef.current = fit
      searchAddonRef.current = searchAddon
      setSearchAddonReady(true)

      requestAnimationFrame(() => {
        if (fitRef.current) {
          fitRef.current.fit()
        }
        requestAnimationFrame(() => {
          if (fitRef.current) {
            fitRef.current.fit()
          }
          // 如果是活动标签页，聚焦终端
          if (isActive && termRef.current) {
            termRef.current.focus()
          }
        })
      })

      // 监听用户输入
      term.onData(data => {
        const status = getTabStatus(connectionId)
        if (status === 'connected') {
          // 如果需要本地回显，将用户输入写入终端
          if (localEchoRef.current) {
            // 处理换行符：\r 需要转换成 \r\n 才能正确换行
            const echoData = data.replace(/\r/g, '\r\n')
            term.write(echoData)
          }
          sendToTab(connectionId, data)
        } else if (data === '\r' || data === '\n') {
          // 按回车重连
          const currentSessionId = getPaneSessionId()
          if (currentSessionId) {
            term.writeln('\x1b[1;36m正在重新连接...\x1b[0m')
            setTabStatus(connectionId, 'connecting')
            disconnectTab(connectionId).catch(() => {}).finally(() => {
              connectTab(connectionId, currentSessionId, term.cols, term.rows)
                .then(async () => {
                  // 查询是否需要本地回显
                  try {
                    const needEcho = await api.needLocalEcho(connectionId)
                    localEchoRef.current = needEcho
                  } catch (e) {
                    localEchoRef.current = true // 查询失败时保持本地回显
                  }
                  term.writeln('\x1b[1;32m' + t('terminal.connected') + '\x1b[0m')
                })
                .catch(e => {
                  term.writeln('\x1b[1;31m' + t('terminal.connectFailed') + ': ' + e + '\x1b[0m')
                  term.writeln('\x1b[1;33m' + t('terminal.retryHint') + '\x1b[0m')
                  setTabStatus(connectionId, 'disconnected')
                })
            })
          } else {
            term.writeln('\x1b[1;31m' + t('terminal.sessionNotFound') + '\x1b[0m')
          }
        }
      })

      // 选中即复制
      term.onSelectionChange(() => {
        if (terminalSettings.copyOnSelect && term.hasSelection()) {
          copySelection(term)
        }
      })

      terminalElement = ref.current

      // 缓存终端实例（在 setTerminalReady 之前）
      terminalCache.set(paneId, {
        terminal: term,
        fitAddon: fit,
        searchAddon: searchAddon,
        dataBuffer: [],
        eventsRegistered: false
      })

      setTerminalReady(true)
    }

    // 右键粘贴
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault()
      if (terminalSettings.pasteOnRightClick) {
        pasteFromClipboard()
      }
    }

    terminalElement?.addEventListener('contextmenu', handleContextMenu)

    // ResizeObserver 监听容器大小变化
    const resizeObserver = new ResizeObserver(() => {
      handleResize()
      requestAnimationFrame(() => handleResize())
    })
    if (terminalElement) {
      resizeObserver.observe(terminalElement)
    }
    resizeObserverRef.current = resizeObserver

    // 监听窗口大小变化
    const handleWindowResize = () => {
      handleResize()
      setTimeout(() => handleResize(), 50)
      setTimeout(() => handleResize(), 150)
      setTimeout(() => handleResize(), 300)
    }
    window.addEventListener('resize', handleWindowResize)

    // 监听全屏变化
    const handleFullscreenChange = () => {
      handleResize()
      setTimeout(() => handleResize(), 50)
      setTimeout(() => handleResize(), 150)
      setTimeout(() => handleResize(), 300)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)

    // 监听 Wails 窗口全屏变化事件
    const handleWailsFullscreen = () => {
      handleResize()
      setTimeout(() => handleResize(), 50)
      setTimeout(() => handleResize(), 150)
      setTimeout(() => handleResize(), 300)
    }
    if (window.runtime) {
      window.runtime.EventsOn('window-fullscreen-changed', handleWailsFullscreen)
    }

    return () => {
      window.removeEventListener('resize', handleWindowResize)
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      if (window.runtime) {
        window.runtime.EventsOff('window-fullscreen-changed')
      }
      resizeObserver.disconnect()
      terminalElement.removeEventListener('contextmenu', handleContextMenu)
      setTerminalReady(false)
      setSearchAddonReady(false)

      const state = useTerminalStore.getState()
      const tab = state.tabs.find(t => t.id === tabId)
      const paneStillExists = tab && paneExistsInTree(tab.rootPane, paneId)

      if (paneStillExists) {
        const cachedData = terminalCache.get(paneId)
        if (cachedData) {
          cachedData.dataBuffer = dataBufferRef.current
          cachedData.eventsRegistered = eventsRegisteredRef.current
        }
      } else {
        if (eventsRegisteredRef.current && window.runtime) {
          const dataEvent = `terminal-data-${connectionId}`
          const disconnectEvent = `terminal-disconnected-${connectionId}`
          const echoChangeEvent = `telnet-echo-change-${connectionId}`
          window.runtime.EventsOff(dataEvent)
          window.runtime.EventsOff(disconnectEvent)
          window.runtime.EventsOff(echoChangeEvent)
        }
        disconnectTab(connectionId)
        if (termRef.current) {
          termRef.current.dispose()
          termRef.current = null
        }
        fitRef.current = null
        dataBufferRef.current = []
        eventsRegisteredRef.current = false
        terminalCache.delete(paneId)
      }
    }
  }, [paneId])

  // 连接和事件监听管理
  useEffect(() => {
    if (!terminalReady || !termRef.current) return

    const term = termRef.current

    // 确保 fit
    if (fitRef.current) {
      fitRef.current.fit()
    }

    const connectTimer = setTimeout(() => {
      if (!termRef.current) return

      if (fitRef.current) {
        fitRef.current.fit()
      }

      const cols = term.cols
      const rows = term.rows

      const status = getTabStatus(connectionId)

      if (status === 'connected') {
        resizeTab(connectionId, cols, rows)
        // 查询是否需要本地回显
        api.needLocalEcho(connectionId).then(needEcho => {
          localEchoRef.current = needEcho
        }).catch(() => {
          localEchoRef.current = true // 查询失败时保持本地回显
        })
      } else if (status === 'connecting') {
        // 正在连接中，等待
      } else if (sessionId) {
        setTabStatus(connectionId, 'connecting')
        connectTab(connectionId, sessionId, cols, rows)
          .then(async () => {
            // 查询是否需要本地回显
            try {
              const needEcho = await api.needLocalEcho(connectionId)
              localEchoRef.current = needEcho
            } catch (e) {
              localEchoRef.current = true // 查询失败时保持本地回显
            }
          })
          .catch(e => {
            term.writeln('\x1b[1;31m' + t('terminal.connectFailed') + ': ' + e + '\x1b[0m')
            term.writeln('\x1b[1;33m' + t('terminal.retryHint') + '\x1b[0m')
            setTabStatus(connectionId, 'disconnected')
          })
      }
    }, 100)

    // 注册事件监听（只注册一次）
    const dataEvent = `terminal-data-${connectionId}`
    const disconnectEvent = `terminal-disconnected-${connectionId}`
    const echoChangeEvent = `telnet-echo-change-${connectionId}`

    const handleData = (data: string) => {
      if (termRef.current) {
        termRef.current.write(data, () => {
          // 写入后滚动到底部
          termRef.current?.scrollToBottom()
        })
      } else {
        dataBufferRef.current.push(data)
      }
    }

    const handleDisconnect = () => {
      setTabStatus(connectionId, 'disconnected')
      if (termRef.current) {
        termRef.current.writeln('')
        termRef.current.writeln('\x1b[1;33m' + t('terminal.disconnected') + '\x1b[0m')
      }
    }

    const handleEchoChange = (needLocalEcho: boolean) => {
      localEchoRef.current = needLocalEcho
    }

    if (window.runtime) {
      // 先取消之前可能存在的注册，避免重复
      window.runtime.EventsOff(dataEvent)
      window.runtime.EventsOff(disconnectEvent)
      window.runtime.EventsOff(echoChangeEvent)
      // 重新注册
      window.runtime.EventsOn(dataEvent, handleData)
      window.runtime.EventsOn(disconnectEvent, handleDisconnect)
      window.runtime.EventsOn(echoChangeEvent, handleEchoChange)
      eventsRegisteredRef.current = true
    }

    flushBuffer()

    return () => {
      clearTimeout(connectTimer)
      // 注意：这里不取消事件监听，也不断开连接
      // 只有组件真正销毁时（第一个 useEffect 的 cleanup）才断开
    }
  }, [terminalReady, paneId, sessionId])

  // 当标签页变为活动状态时，重新 fit 终端并聚焦
  useEffect(() => {
    if (isActive && fitRef.current && termRef.current) {
      requestAnimationFrame(() => {
        if (fitRef.current && termRef.current) {
          const oldCols = termRef.current.cols
          const oldRows = termRef.current.rows
          fitRef.current.fit()
          const newCols = termRef.current.cols
          const newRows = termRef.current.rows
          if (newCols !== oldCols || newRows !== oldRows) {
            const status = getTabStatus(connectionId)
            if (status === 'connected') {
              resizeTab(connectionId, newCols, newRows)
            }
          }
          // 聚焦终端，让用户可以直接输入
          termRef.current.focus()
        }
      })
    }
  }, [isActive, connectionId, getTabStatus, resizeTab])

  // 主题切换
  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.theme = {
        background: terminalTheme.colors.background,
        foreground: terminalTheme.colors.foreground,
        cursor: terminalTheme.colors.cursor,
        selectionBackground: terminalTheme.colors.selectionBackground,
        black: terminalTheme.colors.black,
        red: terminalTheme.colors.red,
        green: terminalTheme.colors.green,
        yellow: terminalTheme.colors.yellow,
        blue: terminalTheme.colors.blue,
        magenta: terminalTheme.colors.magenta,
        cyan: terminalTheme.colors.cyan,
        white: terminalTheme.colors.white,
        brightBlack: terminalTheme.colors.brightBlack,
        brightRed: terminalTheme.colors.brightRed,
        brightGreen: terminalTheme.colors.brightGreen,
        brightYellow: terminalTheme.colors.brightYellow,
        brightBlue: terminalTheme.colors.brightBlue,
        brightMagenta: terminalTheme.colors.brightMagenta,
        brightCyan: terminalTheme.colors.brightCyan,
        brightWhite: terminalTheme.colors.brightWhite,
      }
    }
  }, [terminalTheme])

  // 字体设置变化
  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.fontFamily = terminalSettings.fontFamily
      termRef.current.options.fontSize = terminalSettings.fontSize
      if (fitRef.current) {
        fitRef.current.fit()
      }
    }
  }, [terminalSettings.fontFamily, terminalSettings.fontSize])

  // 搜索快捷键 (Cmd+F / Ctrl+F)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        // 只在当前活动 pane 时响应
        if (isActive) {
          e.preventDefault()
          setShowSearch(true)
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isActive])

  return (
    <div className="h-full w-full relative flex flex-col terminal-bg overflow-hidden">
      {/* 顶部搜索栏 */}
      {showSearch && searchAddonReady && terminalSettings.searchBarPosition === 'top' && (
        <TerminalSearchBar
          paneId={paneId}
          searchAddon={searchAddonRef.current}
          onClose={() => setShowSearch(false)}
          position="top"
          terminalBackground={terminalTheme.colors.background}
        />
      )}

      <div
        ref={ref}
        className="flex-1 w-full overflow-hidden"
        style={{ backgroundColor: terminalTheme.colors.background }}
      />

      {/* 底部搜索栏 */}
      {showSearch && searchAddonReady && terminalSettings.searchBarPosition === 'bottom' && (
        <TerminalSearchBar
          paneId={paneId}
          searchAddon={searchAddonRef.current}
          onClose={() => setShowSearch(false)}
          position="bottom"
          terminalBackground={terminalTheme.colors.background}
        />
      )}

    </div>
  )
}