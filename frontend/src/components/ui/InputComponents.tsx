import { useState, useEffect, useRef } from 'react'
import { ChevronDown } from 'lucide-react'
import { useSettingsStore } from '../../stores/settingsStore'
import { useLocale } from '../../stores/localeStore'
import type { AppTheme } from '../themes'

// 滑块输入组件（动态渐变背景 + 数字输入框 + 单位标签）
interface SliderInputProps {
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step?: number
  unit?: string
  label?: string
  themeOverride?: AppTheme
}

export function SliderInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  unit = '',
  label,
  themeOverride,
}: SliderInputProps) {
  const storeTheme = useSettingsStore.getState().getTheme()
  const theme = themeOverride || storeTheme
  const progress = ((value - min) / (max - min)) * 100

  return (
    <div className="flex items-center gap-3">
      {label && (
        <span className="text-sm" style={{ color: theme.ui.textSecondary }}>{label}</span>
      )}
      {/* 动态渐变滑块 */}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 h-2 rounded-full appearance-none cursor-pointer"
        style={{
          background: `linear-gradient(to right, ${theme.ui.accent} 0%, ${theme.ui.accent} ${progress}%, ${theme.ui.surface3} ${progress}%, ${theme.ui.surface3} 100%)`
        }}
      />
      {/* 数字输入框 */}
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          const val = parseFloat(e.target.value)
          if (val >= min && val <= max) {
            onChange(val)
          }
        }}
        className="w-16 px-2 py-1 rounded-lg text-sm text-center outline-none"
        style={{
          backgroundColor: theme.ui.surface2,
          color: theme.ui.textPrimary,
          border: `1px solid ${theme.ui.border}`
        }}
      />
      {/* 单位标签 */}
      {unit && (
        <span className="text-sm" style={{ color: theme.ui.textSecondary }}>{unit}</span>
      )}
    </div>
  )
}

// 开关组件
interface ToggleSwitchProps {
  value: boolean
  onChange: (value: boolean) => void
  size?: 'small' | 'default'
  themeOverride?: AppTheme
}

export function ToggleSwitch({
  value,
  onChange,
  size = 'default',
  themeOverride,
}: ToggleSwitchProps) {
  const storeTheme = useSettingsStore.getState().getTheme()
  const theme = themeOverride || storeTheme

  const isSmall = size === 'small'
  const width = isSmall ? 40 : 44
  const height = isSmall ? 20 : 24
  const knobSize = 16
  const translateX = value ? (isSmall ? 22 : 24) : 2

  return (
    <button
      onClick={() => onChange(!value)}
      className="rounded-full transition-colors duration-200"
      style={{
        width: `${width}px`,
        height: `${height}px`,
        backgroundColor: value ? theme.ui.accent : theme.ui.surface3,
      }}
    >
      <div
        className="rounded-full transition-transform duration-200"
        style={{
          width: `${knobSize}px`,
          height: `${knobSize}px`,
          backgroundColor: '#fff',
          marginTop: '2px',
          marginLeft: `${translateX}px`,
        }}
      />
    </button>
  )
}

// 分段选择器
interface SegmentedControlOption {
  value: string
  label: string
}

interface SegmentedControlProps {
  value: string
  onChange: (value: string) => void
  options: SegmentedControlOption[]
  themeOverride?: AppTheme
}

export function SegmentedControl({
  value,
  onChange,
  options,
  themeOverride,
}: SegmentedControlProps) {
  const storeTheme = useSettingsStore.getState().getTheme()
  const theme = themeOverride || storeTheme

  return (
    <div className="flex gap-2">
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className="px-3 py-1.5 rounded-lg text-sm transition-colors"
          style={{
            backgroundColor: value === opt.value ? theme.ui.accent : theme.ui.surface2,
            color: value === opt.value ? '#fff' : theme.ui.textPrimary,
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// 设置卡片容器
interface SettingCardProps {
  icon: React.ReactNode
  title: string
  description?: string
  children: React.ReactNode
  themeOverride?: AppTheme
}

export function SettingCard({
  icon,
  title,
  description,
  children,
  themeOverride,
}: SettingCardProps) {
  const storeTheme = useSettingsStore.getState().getTheme()
  const theme = themeOverride || storeTheme

  return (
    <div className="p-4 rounded-xl" style={{ backgroundColor: theme.ui.surface1 }}>
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2 rounded-lg" style={{ backgroundColor: theme.ui.surface2 }}>
          {icon}
        </div>
        <div>
          <div className="font-medium" style={{ color: theme.ui.textPrimary }}>{title}</div>
          {description && (
            <div className="text-xs mt-0.5" style={{ color: theme.ui.textMuted }}>
              {description}
            </div>
          )}
        </div>
      </div>
      {children}
    </div>
  )
}

// 字体选择器（支持手动输入）
interface FontOption {
  value: string
  label: string
}

interface FontSelectorProps {
  value: string
  onChange: (value: string) => void
  fonts: FontOption[]
  label?: string
  allowCustomInput?: boolean
  themeOverride?: AppTheme
}

export function FontSelector({
  value,
  onChange,
  fonts,
  label,
  allowCustomInput = true,
  themeOverride,
}: FontSelectorProps) {
  const storeTheme = useSettingsStore.getState().getTheme()
  const theme = themeOverride || storeTheme
  const { t } = useLocale()
  const [showDropdown, setShowDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // 点击外部关闭下拉框
  useEffect(() => {
    if (!showDropdown) return
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showDropdown])

  return (
    <div>
      {label && (
        <label className="block text-sm mb-2" style={{ color: theme.ui.textSecondary }}>{label}</label>
      )}
      {allowCustomInput ? (
        <div className="relative" ref={dropdownRef}>
          <div className="flex gap-2">
            <input
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="Monaco, Menlo"
              className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
              style={{
                backgroundColor: theme.ui.surface2,
                color: theme.ui.textPrimary,
                border: `1px solid ${theme.ui.border}`
              }}
            />
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="px-3 py-2 rounded-lg flex items-center gap-1"
              style={{ backgroundColor: theme.ui.surface2, color: theme.ui.textPrimary }}
            >
              <ChevronDown size={14} />
            </button>
          </div>
          {showDropdown && (
            <div
              className="absolute top-full left-0 right-0 mt-1 rounded-lg shadow-lg overflow-hidden z-10"
              style={{ backgroundColor: theme.ui.surface1, border: `1px solid ${theme.ui.border}` }}
            >
              {fonts.map(f => (
                <div
                  key={f.value}
                  className="px-3 py-2 text-sm cursor-pointer hover:bg-opacity-80"
                  style={{
                    backgroundColor: value === f.value ? theme.ui.surface2 : 'transparent',
                    color: theme.ui.textPrimary
                  }}
                  onClick={() => {
                    onChange(f.value)
                    setShowDropdown(false)
                  }}
                >
                  {f.label}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 rounded-lg text-sm outline-none"
          style={{
            backgroundColor: theme.ui.surface2,
            color: theme.ui.textPrimary,
            border: `1px solid ${theme.ui.border}`
          }}
        >
          {fonts.map(f => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
      )}
    </div>
  )
}