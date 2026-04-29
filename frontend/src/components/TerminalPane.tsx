import { useEffect, useRef, useMemo, useState, useCallback } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { WebLinksAddon } from 'xterm-addon-web-links'
import { SearchAddon } from '@xterm/addon-search'
import 'xterm/css/xterm.css'
import { useSessionStore } from '../stores/sessionStore'
import { useTerminalStore, type PaneNode } from '../stores/terminalStore'
import { useSettingsStore } from '../stores/settingsStore'
import { themeToCssVariables } from './themes'
import { useLocale } from '../stores/localeStore'
import { findPane, paneExistsInTree } from '../utils/paneUtils'
import { api } from '../api/wails'
import { TerminalZmodemController, type ZmodemTransferProgress } from '../utils/zmodem'
import { TerminalSearchBar } from './TerminalSearchBar'

declare global {
  interface Window {
    runtime: {
      EventsOn: (event: string, callback: (...args: any[]) => void) => () => void
      EventsOff: (event: string) => void
    }
  }
}

interface Props { tabId: string; paneId: string; isActive: boolean }

// 辅助函数：提供实色选择背景，避免半透明背景色与原本带底色或不同前景色的文本混合后失去辨识度
function getSystemSelectionBackground(bgColor: string): string {
  if (!bgColor || !bgColor.startsWith('#') || bgColor.length < 7) return '#5c5c5c'
  const hex = bgColor.replace('#', '')
  const r = parseInt(hex.substring(0, 2), 16) || 0
  const g = parseInt(hex.substring(2, 4), 16) || 0
  const b = parseInt(hex.substring(4, 6), 16) || 0
  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000
  // 暗色主题：使用实体的中灰色（#5c5c5c），能够完全覆盖掉文字本身的各种底色
  // 亮色主题：实体的浅灰色（#c0c0c0）
  return yiq < 128 ? '#5c5c5c' : '#c0c0c0'
}

// 辅助函数：在节点树中查找 pane 的 sessionId（使用 paneUtils 的 findPane）
function findPaneSessionId(node: PaneNode, targetPaneId: string): string | undefined {
  return findPane(node, targetPaneId)?.sessionId
}

// 全局终端缓存 - 用于组件重新挂载时恢复终端
interface TerminalCache {
  terminal: Terminal
  fitAddon: FitAddon
  searchAddon: SearchAddon
  dataBuffer: string[]
  eventsRegistered: boolean
  zmodemController: TerminalZmodemController | null
}

const terminalCache = new Map<string, TerminalCache>()

export function TerminalPane({ tabId, paneId, isActive }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const searchAddonRef = useRef<SearchAddon | null>(null)
  const zmodemRef = useRef<TerminalZmodemController | null>(null)
  const dataBufferRef = useRef<string[]>([])
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const [terminalReady, setTerminalReady] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [searchAddonReady, setSearchAddonReady] = useState(false)
  const [backgroundImageData, setBackgroundImageData] = useState<string>('')
  const [zmodemProgress, setZmodemProgress] = useState<ZmodemTransferProgress | null>(null)
  // 标记是否已注册事件监听
  const eventsRegisteredRef = useRef(false)

  const { connectTab, disconnectTab, getTabStatus, setTabStatus, sendToTab, resizeTab, sessions } = useSessionStore()
  const { getTerminalTheme, getTerminalThemeById, getThemeById, terminalSettings, currentTheme, backgroundSettings } = useSettingsStore()
  const { t } = useLocale()
  const localEchoRef = useRef<boolean>(false) // 默认禁用本地回显，由服务端控制回显

  // 全局背景是否应用到终端（scope 为 'terminal' 或 'both'）
  const hasGlobalTerminalBg = backgroundSettings.enabled &&
    (backgroundSettings.scope === 'terminal' || backgroundSettings.scope === 'both')

  // 使用 selector 获取 sessionId
  const sessionId = useTerminalStore(state => {
    const tab = state.tabs.find(t => t.id === tabId)
    if (!tab) return undefined
    return findPaneSessionId(tab.rootPane, paneId)
  })

  // 获取终端主题
  const terminalTheme = useMemo(() => getTerminalTheme(), [currentTheme, getTerminalTheme])

  // 获取当前会话的个性化配置
  const session = useMemo(() => sessionId ? sessions.find(s => s.id === sessionId) : undefined, [sessionId, sessions])
  const useCustom = session?.useCustomSettings

  // 计算有效配置
  // 注意：对数字类型字段使用 ?? 而非 &&...? 模式，避免 0 被误判为 falsy
  const effectiveConfig = useMemo(() => {
    const sessionTheme = useCustom && session?.themeId ? getTerminalThemeById(session.themeId) : null
    const effectiveTheme = sessionTheme || terminalTheme
    return {
      theme: effectiveTheme,
      // 字符串字段：空字符串视为"未设置"，回退到全局设置
      fontFamily: (useCustom && session?.fontFamily) ? session.fontFamily : terminalSettings.fontFamily,
      // 数字字段：使用 ?? 保证 0 能正确生效
      fontSize: useCustom ? (session?.fontSize ?? terminalSettings.fontSize) : terminalSettings.fontSize,
      lineHeight: useCustom ? (session?.lineHeight ?? 1.2) : 1.2,
      letterSpacing: useCustom ? (session?.letterSpacing ?? 0) : 0,
      cursorBlink: useCustom ? (session?.cursorBlink ?? true) : true,
      cursorStyle: (useCustom && session?.cursorStyle) ? session.cursorStyle : 'block',
      scrollback: useCustom ? (session?.scrollback ?? 10000) : 10000,
      // 背景图设置：字符串路径用 && 判断，数字透明度/模糊用 ?? 保证 0 可用
      backgroundImage: (useCustom && session?.backgroundImage) ? session.backgroundImage : '',
      backgroundOpacity: useCustom ? (session?.backgroundOpacity ?? 50) : 50,
      backgroundBlur: useCustom ? (session?.backgroundBlur ?? 0) : 0,
    }
  }, [useCustom, session, terminalTheme, terminalSettings, getTerminalThemeById])

  // 计算终端的背景色（有背景图时透明）
  const effectiveTerminalBg = useMemo(() => {
    if (useCustom) {
      // 开启了个性化设置：如果有自己的背景图则透明，否则使用个性化主题的背景色（隔离全局背景图）
      return session?.backgroundImage ? 'transparent' : effectiveConfig.theme.colors.background
    }
    // 未开启个性化设置：跟随全局背景图逻辑
    if (hasGlobalTerminalBg) return 'transparent'
    return effectiveConfig.theme.colors.background
  }, [useCustom, session?.backgroundImage, hasGlobalTerminalBg, effectiveConfig.theme.colors.background])

  // 如果启用了个性化主题，生成该主题对应的 CSS 变量，用于覆盖全局作用域（如滚动条等）
  const sessionCssVars = useMemo(() => {
    if (!useCustom || !session?.themeId) return undefined
    const theme = getThemeById(session.themeId)
    if (!theme) return undefined
    return themeToCssVariables(theme)
  }, [useCustom, session?.themeId, getThemeById])

  // paneId 作为连接标识符
  const connectionId = paneId

  // 用于重连时获取最新的 sessionId
  const getPaneSessionId = useCallback(() => {
    const state = useTerminalStore.getState()
    const tab = state.tabs.find(t => t.id === tabId)
    if (!tab) return undefined
    return findPaneSessionId(tab.rootPane, paneId)
  }, [tabId, paneId])

  // 加载会话背景图
  useEffect(() => {
    let ignore = false
    const imagePath = effectiveConfig.backgroundImage
    if (!imagePath) {
      setBackgroundImageData('')
      return
    }
    // 如果已经是完整的 data URL，直接使用
    if (imagePath.startsWith('data:image')) {
      setBackgroundImageData(imagePath)
      return
    }
    // 否则通过 API 加载图片并添加 MIME 前缀
    api.loadBackgroundImage(imagePath).then(base64 => {
      if (ignore) return
      // 根据文件扩展名确定 MIME 类型
      const ext = imagePath.toLowerCase().split('.').pop()
      const mimeTypes: Record<string, string> = {
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'gif': 'image/gif',
        'webp': 'image/webp',
        'bmp': 'image/bmp',
      }
      const mimeType = mimeTypes[ext || ''] || 'image/png'
      setBackgroundImageData(`data:${mimeType};base64,${base64}`)
    }).catch(err => {
      if (ignore) return
      console.error('Failed to load session background image:', err)
      setBackgroundImageData('')
    })
    
    return () => { ignore = true }
  }, [effectiveConfig.backgroundImage])

  // 处理缓冲的数据
  const flushBuffer = () => {
    if (termRef.current && dataBufferRef.current.length > 0) {
      dataBufferRef.current.forEach(base64Data => {
        // 同样需要解码后写入
        const binaryString = window.atob(base64Data)
        const bytes = new Uint8Array(binaryString.length)
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i)
        }
        
        if (zmodemRef.current) {
          zmodemRef.current.consume(base64Data)
        } else {
          termRef.current?.write(bytes)
        }
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
        // 更新 store 中的 pane 尺寸，供 StatusBar 实时显示
        useTerminalStore.getState().updatePaneSize(tabId, paneId, newCols, newRows)
      }
    }
  }, [connectionId, getTabStatus, resizeTab, tabId, paneId])

  const formatTransferBytes = (value: number) => {
    if (!Number.isFinite(value) || value <= 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB']
    let size = value
    let unitIndex = 0
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex += 1
    }
    return `${size >= 100 || unitIndex === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unitIndex]}`
  }

  const progressPercent = zmodemProgress && zmodemProgress.totalBytes > 0
    ? Math.min(100, Math.max(0, (zmodemProgress.transferredBytes / zmodemProgress.totalBytes) * 100))
    : 0

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
      zmodemRef.current = cached.zmodemController
      zmodemRef.current?.updateOptions({ onProgress: setZmodemProgress, translate: t })
      dataBufferRef.current = cached.dataBuffer
      eventsRegisteredRef.current = cached.eventsRegistered
      setSearchAddonReady(true)

      // 从缓存恢复时立即应用最新配置
      const term = cached.terminal
      term.options.theme = {
        background: effectiveTerminalBg,
        foreground: effectiveConfig.theme.colors.foreground,
        cursor: effectiveConfig.theme.colors.cursor,
        selectionBackground: getSystemSelectionBackground(effectiveConfig.theme.colors.background),
        black: effectiveConfig.theme.colors.black,
        red: effectiveConfig.theme.colors.red,
        green: effectiveConfig.theme.colors.green,
        yellow: effectiveConfig.theme.colors.yellow,
        blue: effectiveConfig.theme.colors.blue,
        magenta: effectiveConfig.theme.colors.magenta,
        cyan: effectiveConfig.theme.colors.cyan,
        white: effectiveConfig.theme.colors.white,
        brightBlack: effectiveConfig.theme.colors.brightBlack,
        brightRed: effectiveConfig.theme.colors.brightRed,
        brightGreen: effectiveConfig.theme.colors.brightGreen,
        brightYellow: effectiveConfig.theme.colors.brightYellow,
        brightBlue: effectiveConfig.theme.colors.brightBlue,
        brightMagenta: effectiveConfig.theme.colors.brightMagenta,
        brightCyan: effectiveConfig.theme.colors.brightCyan,
        brightWhite: effectiveConfig.theme.colors.brightWhite,
      }
      term.options.fontFamily = effectiveConfig.fontFamily
      term.options.fontSize = effectiveConfig.fontSize
      term.options.lineHeight = effectiveConfig.lineHeight
      term.options.letterSpacing = effectiveConfig.letterSpacing
      term.options.cursorBlink = effectiveConfig.cursorBlink
      term.options.cursorStyle = effectiveConfig.cursorStyle

      terminalElement = cached.terminal.element
      if (terminalElement && ref.current) {
        ref.current.innerHTML = ''
        ref.current.appendChild(terminalElement)
        requestAnimationFrame(() => {
          fitRef.current?.fit()
          // 更新 pane 尺寸到 store
          if (termRef.current) {
            useTerminalStore.getState().updatePaneSize(tabId, paneId, termRef.current.cols, termRef.current.rows)
          }
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
          background: effectiveTerminalBg,
          foreground: effectiveConfig.theme.colors.foreground,
          cursor: effectiveConfig.theme.colors.cursor,
          selectionBackground: getSystemSelectionBackground(effectiveConfig.theme.colors.background),
          black: effectiveConfig.theme.colors.black,
          red: effectiveConfig.theme.colors.red,
          green: effectiveConfig.theme.colors.green,
          yellow: effectiveConfig.theme.colors.yellow,
          blue: effectiveConfig.theme.colors.blue,
          magenta: effectiveConfig.theme.colors.magenta,
          cyan: effectiveConfig.theme.colors.cyan,
          white: effectiveConfig.theme.colors.white,
          brightBlack: effectiveConfig.theme.colors.brightBlack,
          brightRed: effectiveConfig.theme.colors.brightRed,
          brightGreen: effectiveConfig.theme.colors.brightGreen,
          brightYellow: effectiveConfig.theme.colors.brightYellow,
          brightBlue: effectiveConfig.theme.colors.brightBlue,
          brightMagenta: effectiveConfig.theme.colors.brightMagenta,
          brightCyan: effectiveConfig.theme.colors.brightCyan,
          brightWhite: effectiveConfig.theme.colors.brightWhite,
        },
        fontFamily: effectiveConfig.fontFamily,
        fontSize: effectiveConfig.fontSize,
        lineHeight: effectiveConfig.lineHeight,
        letterSpacing: effectiveConfig.letterSpacing,
        cursorBlink: effectiveConfig.cursorBlink,
        cursorStyle: effectiveConfig.cursorStyle,
        scrollback: effectiveConfig.scrollback,
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
      zmodemRef.current = new TerminalZmodemController(
        term,
        (base64Data: string) => api.sendToTabBinary(connectionId, base64Data),
        { onProgress: setZmodemProgress, translate: t, getEncoding: () => session?.encoding || 'UTF-8' },
      )
      setSearchAddonReady(true)

      requestAnimationFrame(() => {
        if (fitRef.current && termRef.current) {
          fitRef.current.fit()
          // 立即更新 pane 尺寸到 store
          useTerminalStore.getState().updatePaneSize(tabId, paneId, termRef.current.cols, termRef.current.rows)
        }
        requestAnimationFrame(() => {
          if (fitRef.current && termRef.current) {
            fitRef.current.fit()
            useTerminalStore.getState().updatePaneSize(tabId, paneId, termRef.current.cols, termRef.current.rows)
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
          if (zmodemRef.current?.isActive()) {
            return
          }
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
            term.writeln('\x1b[1;36m' + t('terminal.reconnecting') + '\x1b[0m')
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

      // 监听光标位置变化
      term.onCursorMove(() => {
        if (term.buffer && term.buffer.active) {
          const col = term.buffer.active.cursorX + 1 // 从 1 开始
          const row = term.buffer.active.cursorY + 1
          useTerminalStore.getState().updateCursorPosition(paneId, row, col)
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
        eventsRegistered: false,
        zmodemController: zmodemRef.current
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
    let unbindWailsFullscreen: (() => void) | undefined
    const handleWailsFullscreen = () => {
      handleResize()
      setTimeout(() => handleResize(), 50)
      setTimeout(() => handleResize(), 150)
      setTimeout(() => handleResize(), 300)
    }
    if (window.runtime) {
      unbindWailsFullscreen = window.runtime.EventsOn('window-fullscreen-changed', handleWailsFullscreen)
    }

    return () => {
      window.removeEventListener('resize', handleWindowResize)
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      if (unbindWailsFullscreen) {
        unbindWailsFullscreen()
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
          cachedData.zmodemController = zmodemRef.current
        }
      } else {
        if (eventsRegisteredRef.current && window.runtime) {
          const dataEvent = `terminal-data-bytes-${connectionId}`
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
        zmodemRef.current = null
        dataBufferRef.current = []
        eventsRegisteredRef.current = false
        setZmodemProgress(null)
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
          localEchoRef.current = false
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
              localEchoRef.current = false // SSH/Shell 场景下默认为 false 更安全
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
    const dataEvent = `terminal-data-bytes-${connectionId}`
    const disconnectEvent = `terminal-disconnected-${connectionId}`
    const echoChangeEvent = `telnet-echo-change-${connectionId}`

    const handleData = (base64Data: string) => {
      if (!termRef.current) {
        dataBufferRef.current.push(base64Data)
        return
      }

      // 必须始终让 Zmodem 控制器消费数据，以便它能检测到 sz/rz 的握手信号
      if (zmodemRef.current) {
        zmodemRef.current.consume(base64Data)
        termRef.current.scrollToBottom()
      } else {
        // 如果 Zmodem 还没准备好，解码 Base64 并直接写入（兜底逻辑）
        const binaryString = window.atob(base64Data)
        const bytes = new Uint8Array(binaryString.length)
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i)
        }
        termRef.current.write(bytes)
        termRef.current.scrollToBottom()
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

  // 会话个性化配置变化时更新终端
  useEffect(() => {
    if (termRef.current) {
      // 更新主题（背景色根据背景图状态决定）
      termRef.current.options.theme = {
        background: effectiveTerminalBg,
        foreground: effectiveConfig.theme.colors.foreground,
        cursor: effectiveConfig.theme.colors.cursor,
        selectionBackground: getSystemSelectionBackground(effectiveConfig.theme.colors.background),
        black: effectiveConfig.theme.colors.black,
        red: effectiveConfig.theme.colors.red,
        green: effectiveConfig.theme.colors.green,
        yellow: effectiveConfig.theme.colors.yellow,
        blue: effectiveConfig.theme.colors.blue,
        magenta: effectiveConfig.theme.colors.magenta,
        cyan: effectiveConfig.theme.colors.cyan,
        white: effectiveConfig.theme.colors.white,
        brightBlack: effectiveConfig.theme.colors.brightBlack,
        brightRed: effectiveConfig.theme.colors.brightRed,
        brightGreen: effectiveConfig.theme.colors.brightGreen,
        brightYellow: effectiveConfig.theme.colors.brightYellow,
        brightBlue: effectiveConfig.theme.colors.brightBlue,
        brightMagenta: effectiveConfig.theme.colors.brightMagenta,
        brightCyan: effectiveConfig.theme.colors.brightCyan,
        brightWhite: effectiveConfig.theme.colors.brightWhite,
      }
      // 更新字体
      termRef.current.options.fontFamily = effectiveConfig.fontFamily
      termRef.current.options.fontSize = effectiveConfig.fontSize
      termRef.current.options.lineHeight = effectiveConfig.lineHeight
      termRef.current.options.letterSpacing = effectiveConfig.letterSpacing
      // 更新光标
      termRef.current.options.cursorBlink = effectiveConfig.cursorBlink
      termRef.current.options.cursorStyle = effectiveConfig.cursorStyle
      // fit 终端
      if (fitRef.current) {
        fitRef.current.fit()
      }
    }
  }, [effectiveConfig, effectiveTerminalBg])

  useEffect(() => {
    zmodemRef.current?.updateOptions({ onProgress: setZmodemProgress, translate: t })
  }, [t])

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

  // 是否使用会话个性化背景（需要启用个性化设置、有背景图片路径、且图片数据已加载）
  const hasSessionBackground = useCustom && session?.backgroundImage && !!backgroundImageData

  // 计算背景层样式
  const backgroundStyle = useMemo(() => {
    if (!hasSessionBackground) return null
    return {
      backgroundImage: `url(${backgroundImageData})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
      opacity: effectiveConfig.backgroundOpacity / 100,
      filter: effectiveConfig.backgroundBlur > 0 ? `blur(${effectiveConfig.backgroundBlur}px)` : undefined,
    }
  }, [hasSessionBackground, backgroundImageData, effectiveConfig.backgroundOpacity, effectiveConfig.backgroundBlur])

  return (
    <div
      className={`h-full w-full relative flex flex-col terminal-bg overflow-hidden ${hasSessionBackground ? 'has-session-bg' : ''}`}
      style={sessionCssVars as React.CSSProperties}
    >
      {/* 背景图层 - 仅在会话有个性化背景时显示 */}
      {backgroundStyle && (
        <div
          className="absolute inset-0 z-0"
          style={backgroundStyle}
        />
      )}
      {/* 顶部搜索栏 */}
      {showSearch && searchAddonReady && terminalSettings.searchBarPosition === 'top' && (
        <TerminalSearchBar
          paneId={paneId}
          searchAddon={searchAddonRef.current}
          onClose={() => setShowSearch(false)}
          position="top"
          terminalBackground={effectiveConfig.theme.colors.background}
        />
      )}

      <div
        ref={ref}
        className="flex-1 w-full overflow-hidden relative z-10"
        style={{
          backgroundColor: (hasSessionBackground || (!useCustom && hasGlobalTerminalBg))
            ? 'transparent'
            : effectiveConfig.theme.colors.background
        }}
      />

      {zmodemProgress?.visible && (
        <div className="relative z-20 border-t border-[var(--border-color)] bg-[var(--surface-1)]/92 backdrop-blur-sm px-4 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[13px] leading-5 text-text-primary">
                <span className="font-medium">{zmodemProgress.direction === 'upload' ? t('zmodem.progress.directionUpload') : t('zmodem.progress.directionDownload')}</span>
                <span className="truncate">{zmodemProgress.fileName}</span>
              </div>
              <div className="mt-0.5 text-[11px] leading-4 text-text-secondary flex items-center gap-3 flex-wrap">
                <span>{zmodemProgress.statusText}</span>
                <span>{formatTransferBytes(zmodemProgress.transferredBytes)} / {formatTransferBytes(zmodemProgress.totalBytes)}</span>
                <span>{formatTransferBytes(zmodemProgress.bytesPerSecond)}/s</span>
                {zmodemProgress.retryCount > 0 && <span>{t('zmodem.progress.retryCount', { count: zmodemProgress.retryCount })}</span>}
              </div>
            </div>
            {(zmodemProgress.state === 'starting' || zmodemProgress.state === 'transferring' || zmodemProgress.state === 'retrying') && (
              <button
                type="button"
                className="shrink-0 rounded-md bg-[var(--accent-red)] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:brightness-110 active:brightness-95"
                onClick={() => zmodemRef.current?.cancelTransfer()}
              >
                {t('zmodem.cancel')}
              </button>
            )}
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-3)]">
            <div
              className="h-full rounded-full bg-[var(--accent-blue)] transition-all duration-150"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* 底部搜索栏 */}
      {showSearch && searchAddonReady && terminalSettings.searchBarPosition === 'bottom' && (
        <TerminalSearchBar
          paneId={paneId}
          searchAddon={searchAddonRef.current}
          onClose={() => setShowSearch(false)}
          position="bottom"
          terminalBackground={effectiveConfig.theme.colors.background}
        />
      )}

    </div>
  )
}
