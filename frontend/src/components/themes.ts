export interface AppTheme {
  id: string
  name: string
  description: string
  author: string
  // 主题样式类型
  style?: 'default' | 'crayon-warm' | 'crayon-dark'
  // 终端颜色
  terminal: {
    background: string
    foreground: string
    cursor: string
    selectionBackground: string
    black: string
    red: string
    green: string
    yellow: string
    blue: string
    magenta: string
    cyan: string
    white: string
    brightBlack: string
    brightRed: string
    brightGreen: string
    brightYellow: string
    brightBlue: string
    brightMagenta: string
    brightCyan: string
    brightWhite: string
  }
  // UI 颜色
  ui: {
    // 背景层级
    surface0: string    // 最底层背景
    surface1: string    // 侧边栏背景
    surface2: string    // 悬浮背景
    surface3: string    // 活动背景
    // 文字颜色
    textPrimary: string
    textSecondary: string
    textMuted: string
    // 强调色
    accent: string
    accentHover: string
    // 状态色
    success: string
    warning: string
    error: string
    info: string
    // 边框
    border: string
    // 蜡笔主题特有颜色
    crayon?: {
      stroke1: string   // 蜡笔边框主色
      stroke2: string   // 蜡笔边框次色
      highlight: string // 高亮涂抹色
      shadow: string    // 阴影涂抹色
    }
  }
}

export const appThemes: AppTheme[] = [
  {
    id: 'starry-night',
    name: 'Starry Night',
    description: '深邃优雅的星空主题，晴朗夜晚的宁静与璀璨',
    author: 'Crayon',
    terminal: {
      // 深邃的夜空蓝，点缀星光
      background: '#0d1117', foreground: '#c9d1d9', cursor: '#a78bfa',
      selectionBackground: '#1f3a5f', black: '#1f2937', red: '#f87171',
      green: '#6ee7b7', yellow: '#fcd34d', blue: '#60a5fa', magenta: '#c084fc',
      cyan: '#22d3ee', white: '#e5e7eb', brightBlack: '#4b5563',
      brightRed: '#fca5a5', brightGreen: '#86efac', brightYellow: '#fde68a',
      brightBlue: '#93c5fd', brightMagenta: '#d8b4fe', brightCyan: '#67e8f9',
      brightWhite: '#f3f4f6',
    },
    ui: {
      surface0: '#0d1117',  // 深夜空
      surface1: '#0f172a',  // 夜幕层
      surface2: '#1e293b',  // 远星层
      surface3: '#334155',  // 近星层
      textPrimary: '#e2e8f0',   // 银白星光
      textSecondary: '#94a3b8', // 月光灰
      textMuted: '#64748b',     // 远星微光
      accent: '#a78bfa',        // 星紫 - 优雅的淡紫色
      accentHover: '#8b5cf6',
      success: '#6ee7b7',      // 极光绿
      warning: '#fcd34d',      // 土星金
      error: '#f87171',        // 火星红
      info: '#60a5fa',         // 天王星蓝
      border: '#1e293b',
    }
  },
  {
    id: 'crayon-warm',
    name: 'Crayon Warm',
    description: '温暖的蜡笔画风格，柔和的笔触与涂抹质感',
    author: 'Crayon',
    style: 'crayon-warm',
    terminal: {
      // 终端背景像涂了一层淡淡的橙黄色蜡笔
      background: '#fef6e8', foreground: '#6b4423', cursor: '#e85d4c',
      selectionBackground: '#f5c842', black: '#7a5230', red: '#d9453a',
      green: '#5d9c4a', yellow: '#f0a020', blue: '#3a7cbd', magenta: '#a855a8',
      cyan: '#2a9d8f', white: '#9a7b5a', brightBlack: '#a08060',
      brightRed: '#f06050', brightGreen: '#70c060', brightYellow: '#ffc040',
      brightBlue: '#5090e0', brightMagenta: '#c060c0', brightCyan: '#40c0b0',
      brightWhite: '#fef6e8',
    },
    ui: {
      surface0: '#fef6e8',  // 奶油色画纸
      surface1: '#fbf0d8',  // 淡橙涂抹层
      surface2: '#f7e4c8',  // 橙色涂抹层
      surface3: '#f2d8b8',  // 深橙涂抹层
      textPrimary: '#6b4423',   // 焦褐色蜡笔
      textSecondary: '#8a6030', // 棕色蜡笔
      textMuted: '#b89060',     // 浅棕蜡笔
      accent: '#e85d4c',       // 朱红蜡笔
      accentHover: '#d04838',
      success: '#5d9c4a',      // 草绿蜡笔
      warning: '#f0a020',      // 金黄蜡笔
      error: '#d9453a',        // 大红蜡笔
      info: '#3a7cbd',         // 天蓝蜡笔
      border: '#d4a060',
      crayon: {
        stroke1: '#c07830',    // 橙褐色笔触
        stroke2: '#a06020',    // 深橙笔触
        highlight: '#fff8e0',  // 高光涂抹
        shadow: '#e8d0a0',     // 阴影涂抹
      }
    }
  },
  {
    id: 'crayon-dark',
    name: 'Crayon Dark',
    description: '深邃的蜡笔画风格，夜间柔和的笔触体验',
    author: 'Crayon',
    style: 'crayon-dark',
    terminal: {
      // 深蓝紫色背景像深色画纸
      background: '#1a1625', foreground: '#e8d8c8', cursor: '#f0a878',
      selectionBackground: '#4a3a5a', black: '#3a3040', red: '#f06070',
      green: '#70c080', yellow: '#f0c850', blue: '#70a0f0', magenta: '#d080d0',
      cyan: '#60c0c0', white: '#c8b8a8', brightBlack: '#5a5060',
      brightRed: '#ff8090', brightGreen: '#90e090', brightYellow: '#ffe070',
      brightBlue: '#90c0ff', brightMagenta: '#e0a0e0', brightCyan: '#80e0e0',
      brightWhite: '#f0e0d0',
    },
    ui: {
      surface0: '#1a1625',  // 深紫黑画纸
      surface1: '#221e30',  // 紫色涂抹层
      surface2: '#2a2638',  // 深紫涂抹层
      surface3: '#342e40',  // 更深涂抹层
      textPrimary: '#e8d8c8',   // 米白蜡笔
      textSecondary: '#c8b8a8', // 浅米蜡笔
      textMuted: '#9080a0',     // 灰紫蜡笔
      accent: '#f0a878',       // 橙黄蜡笔
      accentHover: '#e09060',
      success: '#70c080',      // 青绿蜡笔
      warning: '#f0c850',      // 金黄蜡笔
      error: '#f06070',        // 粉红蜡笔
      info: '#70a0f0',         // 蓝紫蜡笔
      border: '#4a4060',
      crayon: {
        stroke1: '#6850a0',    // 紫色笔触
        stroke2: '#504080',    // 深紫笔触
        highlight: '#302840',  // 高光涂抹
        shadow: '#181420',     // 阴影涂抹
      }
    }
  },
  {
    id: 'catppuccin-mocha',
    name: 'Catppuccin Mocha',
    description: '舒缓的暖色调暗色主题',
    author: 'Catppuccin',
    terminal: {
      background: '#1e1e2e', foreground: '#cdd6f4', cursor: '#f5e0dc',
      selectionBackground: '#585b70', black: '#45475a', red: '#f38ba8',
      green: '#a6e3a1', yellow: '#f9e2af', blue: '#89b4fa', magenta: '#f5c2e7',
      cyan: '#94e2d5', white: '#bac2de', brightBlack: '#585b70',
      brightRed: '#f38ba8', brightGreen: '#a6e3a1', brightYellow: '#f9e2af',
      brightBlue: '#89b4fa', brightMagenta: '#f5c2e7', brightCyan: '#94e2d5',
      brightWhite: '#cdd6f4',
    },
    ui: {
      surface0: '#1e1e2e',
      surface1: '#181825',
      surface2: '#313244',
      surface3: '#45475a',
      textPrimary: '#cdd6f4',
      textSecondary: '#bac2de',
      textMuted: '#6c7086',
      accent: '#cba6f7',
      accentHover: '#b4befe',
      success: '#a6e3a1',
      warning: '#f9e2af',
      error: '#f38ba8',
      info: '#89b4fa',
      border: '#45475a',
    }
  },
  {
    id: 'tokyo-night',
    name: 'Tokyo Night',
    description: '深邃的紫色暗色主题，适合夜间编程',
    author: 'enki',
    terminal: {
      background: '#1a1b26', foreground: '#c0caf5', cursor: '#c0caf5',
      selectionBackground: '#364a82', black: '#15161e', red: '#f7768e',
      green: '#9ece6a', yellow: '#e0af68', blue: '#7aa2f7', magenta: '#bb9af7',
      cyan: '#7dcfff', white: '#a9b1d6', brightBlack: '#414868',
      brightRed: '#f7768e', brightGreen: '#9ece6a', brightYellow: '#e0af68',
      brightBlue: '#7aa2f7', brightMagenta: '#bb9af7', brightCyan: '#7dcfff',
      brightWhite: '#c0caf5',
    },
    ui: {
      surface0: '#1a1b26',
      surface1: '#16161e',
      surface2: '#24283b',
      surface3: '#414868',
      textPrimary: '#c0caf5',
      textSecondary: '#a9b1d6',
      textMuted: '#565f89',
      accent: '#bb9af7',
      accentHover: '#7aa2f7',
      success: '#9ece6a',
      warning: '#e0af68',
      error: '#f7768e',
      info: '#7dcfff',
      border: '#3b4261',
    }
  },
  {
    id: 'nord',
    name: 'Nord',
    description: '北极风格的冷色调暗色主题',
    author: 'arcticicestudio',
    terminal: {
      background: '#2e3440', foreground: '#d8dee9', cursor: '#d8dee9',
      selectionBackground: '#434c5e', black: '#3b4252', red: '#bf616a',
      green: '#a3be8c', yellow: '#ebcb8b', blue: '#81a1c1', magenta: '#b48ead',
      cyan: '#88c0d0', white: '#e5e9f0', brightBlack: '#4c566a',
      brightRed: '#bf616a', brightGreen: '#a3be8c', brightYellow: '#ebcb8b',
      brightBlue: '#81a1c1', brightMagenta: '#b48ead', brightCyan: '#88c0d0',
      brightWhite: '#eceff4',
    },
    ui: {
      surface0: '#2e3440',
      surface1: '#272c36',
      surface2: '#3b4252',
      surface3: '#434c5e',
      textPrimary: '#eceff4',
      textSecondary: '#e5e9f0',
      textMuted: '#4c566a',
      accent: '#88c0d0',
      accentHover: '#81a1c1',
      success: '#a3be8c',
      warning: '#ebcb8b',
      error: '#bf616a',
      info: '#81a1c1',
      border: '#4c566a',
    }
  },
  {
    id: 'dracula',
    name: 'Dracula',
    description: '经典的紫色暗色主题',
    author: 'Dracula Theme',
    terminal: {
      background: '#282a36', foreground: '#f8f8f2', cursor: '#f8f8f2',
      selectionBackground: '#44475a', black: '#21222c', red: '#ff5555',
      green: '#50fa7b', yellow: '#f1fa8c', blue: '#bd93f9', magenta: '#ff79c6',
      cyan: '#8be9fd', white: '#f8f8f2', brightBlack: '#6272a4',
      brightRed: '#ff6e6e', brightGreen: '#69ff94', brightYellow: '#ffffa5',
      brightBlue: '#d6acff', brightMagenta: '#ff92df', brightCyan: '#a4ffff',
      brightWhite: '#ffffff',
    },
    ui: {
      surface0: '#282a36',
      surface1: '#21222c',
      surface2: '#44475a',
      surface3: '#6272a4',
      textPrimary: '#f8f8f2',
      textSecondary: '#e5e5e5',
      textMuted: '#6272a4',
      accent: '#bd93f9',
      accentHover: '#ff79c6',
      success: '#50fa7b',
      warning: '#f1fa8c',
      error: '#ff5555',
      info: '#8be9fd',
      border: '#44475a',
    }
  },
  {
    id: 'github-dark',
    name: 'GitHub Dark',
    description: 'GitHub 官方暗色主题',
    author: 'GitHub',
    terminal: {
      background: '#0d1117', foreground: '#c9d1d9', cursor: '#c9d1d9',
      selectionBackground: '#264f78', black: '#484f58', red: '#ff7b72',
      green: '#3fb950', yellow: '#d29922', blue: '#58a6ff', magenta: '#bc8cff',
      cyan: '#39c5cf', white: '#b1bac4', brightBlack: '#6e7681',
      brightRed: '#ffa198', brightGreen: '#56d364', brightYellow: '#e3b341',
      brightBlue: '#79c0ff', brightMagenta: '#d2a8ff', brightCyan: '#56d4dd',
      brightWhite: '#f0f6fc',
    },
    ui: {
      surface0: '#0d1117',
      surface1: '#010409',
      surface2: '#161b22',
      surface3: '#21262d',
      textPrimary: '#c9d1d9',
      textSecondary: '#8b949e',
      textMuted: '#484f58',
      accent: '#58a6ff',
      accentHover: '#79c0ff',
      success: '#3fb950',
      warning: '#d29922',
      error: '#f85149',
      info: '#58a6ff',
      border: '#30363d',
    }
  },
  {
    id: 'material-ocean',
    name: 'Material Oceanic',
    description: 'Material Design 风格海洋主题',
    author: 'Material Theme',
    terminal: {
      background: '#0f111a', foreground: '#8f93a2', cursor: '#8f93a2',
      selectionBackground: '#717CB450', black: '#546E7A', red: '#FF5370',
      green: '#C3E88D', yellow: '#FFCB6B', blue: '#82AAFF', magenta: '#C792EA',
      cyan: '#89DDFF', white: '#FFFFFF', brightBlack: '#717CB4',
      brightRed: '#FF5370', brightGreen: '#C3E88D', brightYellow: '#FFCB6B',
      brightBlue: '#82AAFF', brightMagenta: '#C792EA', brightCyan: '#89DDFF',
      brightWhite: '#FFFFFF',
    },
    ui: {
      surface0: '#0f111a',
      surface1: '#0a0c12',
      surface2: '#1a1c25',
      surface3: '#232632',
      textPrimary: '#eeffff',
      textSecondary: '#b2ccd6',
      textMuted: '#464b5d',
      accent: '#c792ea',
      accentHover: '#82aaff',
      success: '#c3e88d',
      warning: '#ffcb6b',
      error: '#ff5370',
      info: '#89ddff',
      border: '#232632',
    }
  },
  {
    id: 'gruvbox',
    name: 'Gruvbox Dark',
    description: '复古暖色调暗色主题',
    author: 'morhetz',
    terminal: {
      background: '#282828', foreground: '#ebdbb2', cursor: '#ebdbb2',
      selectionBackground: '#665c54', black: '#282828', red: '#cc241d',
      green: '#98971a', yellow: '#d79921', blue: '#458588', magenta: '#b16286',
      cyan: '#689d6a', white: '#a89984', brightBlack: '#928374',
      brightRed: '#fb4934', brightGreen: '#b8bb26', brightYellow: '#fabd2f',
      brightBlue: '#83a598', brightMagenta: '#d3869b', brightCyan: '#8ec07c',
      brightWhite: '#ebdbb2',
    },
    ui: {
      surface0: '#282828',
      surface1: '#1d2021',
      surface2: '#3c3836',
      surface3: '#504945',
      textPrimary: '#ebdbb2',
      textSecondary: '#d5c4a1',
      textMuted: '#928374',
      accent: '#fe8019',
      accentHover: '#fabd2f',
      success: '#b8bb26',
      warning: '#fabd2f',
      error: '#fb4934',
      info: '#83a598',
      border: '#3c3836',
    }
  },
  {
    id: 'one-dark-pro',
    name: 'One Dark Pro',
    description: 'Atom 风格的经典暗色主题',
    author: 'binaryify',
    terminal: {
      background: '#282c34', foreground: '#abb2bf', cursor: '#528bff',
      selectionBackground: '#3e4451', black: '#282c34', red: '#e06c75',
      green: '#98c379', yellow: '#e5c07b', blue: '#61afef', magenta: '#c678dd',
      cyan: '#56b6c2', white: '#abb2bf', brightBlack: '#5c6370',
      brightRed: '#e06c75', brightGreen: '#98c379', brightYellow: '#e5c07b',
      brightBlue: '#61afef', brightMagenta: '#c678dd', brightCyan: '#56b6c2',
      brightWhite: '#abb2bf',
    },
    ui: {
      surface0: '#282c34',
      surface1: '#21252b',
      surface2: '#3e4451',
      surface3: '#4b5263',
      textPrimary: '#abb2bf',
      textSecondary: '#828997',
      textMuted: '#5c6370',
      accent: '#c678dd',
      accentHover: '#61afef',
      success: '#98c379',
      warning: '#e5c07b',
      error: '#e06c75',
      info: '#61afef',
      border: '#3e4451',
    }
  },
]

// 将主题转换为 CSS 变量
export function themeToCssVariables(theme: AppTheme): Record<string, string> {
  const vars: Record<string, string> = {
    '--surface-0': theme.ui.surface0,
    '--surface-1': theme.ui.surface1,
    '--surface-2': theme.ui.surface2,
    '--surface-3': theme.ui.surface3,
    '--text-primary': theme.ui.textPrimary,
    '--text-secondary': theme.ui.textSecondary,
    '--text-muted': theme.ui.textMuted,
    '--accent': theme.ui.accent,
    '--accent-hover': theme.ui.accentHover,
    '--accent-green': theme.ui.success,
    '--accent-blue': theme.ui.info,
    '--accent-red': theme.ui.error,
    '--accent-yellow': theme.ui.warning,
    '--border-color': theme.ui.border,
    // 主题样式类型
    '--theme-style': theme.style || 'default',
  }

  // 添加蜡笔主题特有变量
  if (theme.ui.crayon) {
    vars['--crayon-stroke-1'] = theme.ui.crayon.stroke1
    vars['--crayon-stroke-2'] = theme.ui.crayon.stroke2
    vars['--crayon-highlight'] = theme.ui.crayon.highlight
    vars['--crayon-shadow'] = theme.ui.crayon.shadow
  }

  return vars
}

// 兼容旧版主题格式
export interface TerminalTheme {
  id: string
  name: string
  colors: {
    background: string
    foreground: string
    cursor: string
    selectionBackground: string
    black: string
    red: string
    green: string
    yellow: string
    blue: string
    magenta: string
    cyan: string
    white: string
    brightBlack: string
    brightRed: string
    brightGreen: string
    brightYellow: string
    brightBlue: string
    brightMagenta: string
    brightCyan: string
    brightWhite: string
  }
}

// 转换为旧版格式（兼容现有代码）
export function toTerminalTheme(theme: AppTheme): TerminalTheme {
  return {
    id: theme.id,
    name: theme.name,
    colors: theme.terminal,
  }
}

