import { useState, useEffect } from 'react'
import { Image, Upload, Trash2, RotateCcw, Power, Grid, Plus } from 'lucide-react'
import { useSettingsStore } from '../stores/settingsStore'
import { useLocale } from '../stores/localeStore'
import { api, BackgroundFileInfo } from '../api/wails'
import { SliderInput, ToggleSwitch, SegmentedControl } from './ui'

export function BackgroundSettingsPanel() {
  const { backgroundSettings, setBackgroundSettings, applyBackground, resetBackground } = useSettingsStore()
  const { t } = useLocale()
  const theme = useSettingsStore.getState().getTheme()

  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [savedImages, setSavedImages] = useState<BackgroundFileInfo[]>([])
  const [loadingImages, setLoadingImages] = useState(false)
  const [showImagePicker, setShowImagePicker] = useState(false)

  // 加载已保存的图片列表
  const loadSavedImages = async () => {
    setLoadingImages(true)
    try {
      const images = await api.listBackgroundImages()
      setSavedImages(images || [])
    } catch (e) {
      console.error('Failed to load saved images:', e)
    } finally {
      setLoadingImages(false)
    }
  }

  // 初始加载图片列表
  useEffect(() => {
    loadSavedImages()
  }, [])

  // 加载预览图片
  useEffect(() => {
    if (backgroundSettings.imagePath) {
      loadPreviewImage(backgroundSettings.imagePath)
    } else if (backgroundSettings.imageData) {
      setPreviewUrl(backgroundSettings.imageData)
    } else {
      setPreviewUrl(null)
    }
  }, [backgroundSettings.imagePath, backgroundSettings.imageData])

  // 当 enabled 变化且没有图片时清除预览
  useEffect(() => {
    if (!backgroundSettings.enabled && !backgroundSettings.imagePath) {
      setPreviewUrl(null)
    }
  }, [backgroundSettings.enabled, backgroundSettings.imagePath])

  const loadPreviewImage = async (filename: string) => {
    try {
      const base64Data = await api.loadBackgroundImage(filename)
      const ext = filename.toLowerCase().split('.').pop()
      const mimeTypes: Record<string, string> = {
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'gif': 'image/gif',
        'webp': 'image/webp',
        'bmp': 'image/bmp',
      }
      const mimeType = mimeTypes[ext || ''] || 'image/png'
      setPreviewUrl(`data:${mimeType};base64,${base64Data}`)
    } catch (e) {
      console.error('Failed to load preview image:', e)
    }
  }

  const handleSelectAndUpload = async () => {
    try {
      const filePath = await api.selectFile(t('background.selectImage'), '', 'Image Files:*.png;*.jpg;*.jpeg;*.gif;*.webp;*.bmp')
      if (!filePath) return

      setUploading(true)
      const base64Data = await api.readFileBase64(filePath)
      const filename = filePath.split('/').pop() || 'background.png'
      const savedPath = await api.saveBackgroundImage(base64Data, filename)

      setBackgroundSettings({
        enabled: true,
        storageType: 'file',
        imagePath: savedPath,
      })

      const ext = filename.toLowerCase().split('.').pop()
      const mimeTypes: Record<string, string> = {
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'gif': 'image/gif',
        'webp': 'image/webp',
        'bmp': 'image/bmp',
      }
      const mimeType = mimeTypes[ext || ''] || 'image/png'
      setPreviewUrl(`data:${mimeType};base64,${base64Data}`)

      await applyBackground()
      // 刷新图片列表
      await loadSavedImages()
    } catch (e) {
      console.error('Failed to upload image:', e)
      alert(t('background.uploadFailed') + ': ' + e)
    } finally {
      setUploading(false)
    }
  }

  // 选择已上传的图片
  const handleSelectSavedImage = async (filename: string) => {
    try {
      setBackgroundSettings({
        enabled: true,
        storageType: 'file',
        imagePath: filename,
      })
      await loadPreviewImage(filename)
      await applyBackground()
      setShowImagePicker(false)
    } catch (e) {
      console.error('Failed to select image:', e)
    }
  }

  // 删除已上传的图片
  const handleDeleteSavedImage = async (filename: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await api.deleteBackgroundImage(filename)
      // 如果删除的是当前使用的图片，清除设置
      if (backgroundSettings.imagePath === filename) {
        resetBackground()
        setPreviewUrl(null)
      }
      // 刷新列表
      await loadSavedImages()
    } catch (err) {
      console.error('Failed to delete image:', err)
    }
  }

  const handleDelete = async () => {
    // 只清除设置，不删除文件
    resetBackground()
    setPreviewUrl(null)
  }

  const handleSettingChange = async (settings: Partial<typeof backgroundSettings>) => {
    setBackgroundSettings(settings)
    await applyBackground()
  }

  const fitModes = ['cover', 'contain', 'tile', 'fill'] as const
  const positions = ['center', 'top', 'bottom', 'left', 'right'] as const
  const scopes = ['app', 'terminal', 'both'] as const

  // 获取图片缩略图 URL
  const getThumbnailUrl = async (filename: string): Promise<string> => {
    try {
      const base64Data = await api.loadBackgroundImage(filename)
      const ext = filename.toLowerCase().split('.').pop()
      const mimeTypes: Record<string, string> = {
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'gif': 'image/gif',
        'webp': 'image/webp',
        'bmp': 'image/bmp',
      }
      const mimeType = mimeTypes[ext || ''] || 'image/png'
      return `data:${mimeType};base64,${base64Data}`
    } catch {
      return ''
    }
  }

  return (
    <div className="space-y-4">
      {/* 上传区域 */}
      <div className="p-4 rounded-xl" style={{ backgroundColor: theme.ui.surface1 }}>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg" style={{ backgroundColor: theme.ui.surface2 }}>
            <Image size={18} style={{ color: theme.ui.accent }} />
          </div>
          <span className="font-medium" style={{ color: theme.ui.textPrimary }}>
            {t('background.title')}
          </span>
        </div>

        {/* 预览区域 */}
        <div
          className={`w-full h-40 rounded-lg mb-4 flex items-center justify-center overflow-hidden relative border-2 ${!uploading ? 'cursor-pointer' : ''}`}
          style={{
            backgroundColor: theme.ui.surface2,
            borderColor: previewUrl ? 'transparent' : theme.ui.border,
            borderStyle: previewUrl ? 'solid' : 'dashed',
          }}
        >
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Background preview"
              className="w-full h-full object-cover"
              style={{
                opacity: backgroundSettings.opacity,
                filter: `blur(${backgroundSettings.blur}px)`,
              }}
            />
          ) : (
            <div className="text-center">
              <Upload size={32} style={{ color: theme.ui.textMuted }} />
              <p className="text-sm mt-2" style={{ color: theme.ui.textMuted }}>
                {t('background.noImage')}
              </p>
            </div>
          )}
        </div>

        {/* 操作按钮 */}
        <div className="flex gap-2">
          <button
            onClick={handleSelectAndUpload}
            disabled={uploading}
            className="flex-1 px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors"
            style={{ backgroundColor: theme.ui.accent, color: '#fff', opacity: uploading ? 0.7 : 1 }}
          >
            <Plus size={16} />
            {uploading ? t('background.uploading') : t('background.uploadNew')}
          </button>

          {savedImages.length > 0 && (
            <button
              onClick={() => setShowImagePicker(!showImagePicker)}
              className="px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors"
              style={{ backgroundColor: showImagePicker ? theme.ui.accent : theme.ui.surface2, color: showImagePicker ? '#fff' : theme.ui.textPrimary }}
            >
              <Grid size={16} />
            </button>
          )}

          {previewUrl && (
            <button
              onClick={handleDelete}
              className="px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors hover:opacity-80"
              style={{ backgroundColor: theme.ui.surface2, color: theme.ui.error || '#d9453a' }}
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>

        {/* 已保存的图片列表 */}
        {showImagePicker && savedImages.length > 0 && (
          <div className="mt-4 p-3 rounded-lg" style={{ backgroundColor: theme.ui.surface2 }}>
            <div className="text-sm mb-2" style={{ color: theme.ui.textSecondary }}>
              {t('background.savedImages')}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {savedImages.map((img) => (
                <SavedImageThumbnail
                  key={img.name}
                  image={img}
                  isSelected={backgroundSettings.imagePath === img.name}
                  onSelect={() => handleSelectSavedImage(img.name)}
                  onDelete={(e) => handleDeleteSavedImage(img.name, e)}
                  getThumbnailUrl={getThumbnailUrl}
                  theme={theme}
                />
              ))}
            </div>
          </div>
        )}

        {/* 支持的格式提示 */}
        <p className="text-xs mt-3 text-center" style={{ color: theme.ui.textMuted }}>
          {t('background.supportedFormats')}
        </p>
      </div>

      {/* 设置区域 - 只要有图片就显示 */}
      {previewUrl && (
        <div className="p-4 rounded-xl" style={{ backgroundColor: theme.ui.surface1 }}>
          {/* 启用/禁用开关 */}
          <div className="flex items-center justify-between mb-4 pb-4" style={{ borderBottom: `1px solid ${theme.ui.border}` }}>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg" style={{ backgroundColor: theme.ui.surface2 }}>
                <Power size={18} style={{ color: backgroundSettings.enabled ? theme.ui.accent : theme.ui.textMuted }} />
              </div>
              <div>
                <div className="font-medium" style={{ color: theme.ui.textPrimary }}>
                  {t('background.enabled')}
                </div>
                <div className="text-xs" style={{ color: theme.ui.textMuted }}>
                  {t('background.enabledDesc')}
                </div>
              </div>
            </div>
            <button
              onClick={() => handleSettingChange({ enabled: !backgroundSettings.enabled })}
              className={`w-12 h-6 rounded-full relative transition-colors`}
              style={{ backgroundColor: backgroundSettings.enabled ? theme.ui.accent : theme.ui.surface3 }}
            >
              <div
                className={`w-5 h-5 rounded-full absolute top-0.5 transition-transform`}
                style={{
                  backgroundColor: '#fff',
                  transform: backgroundSettings.enabled ? 'translateX(26px)' : 'translateX(2px)',
                }}
              />
            </button>
          </div>

          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg" style={{ backgroundColor: theme.ui.surface2 }}>
              <Image size={18} style={{ color: theme.ui.accent }} />
            </div>
            <span className="font-medium" style={{ color: theme.ui.textPrimary }}>
              {t('background.settings')}
            </span>
          </div>

          {/* 透明度滑块 */}
          <div className="mb-4">
            <SliderInput
              value={Math.round(backgroundSettings.opacity * 100)}
              onChange={(v) => handleSettingChange({ opacity: v / 100 })}
              min={0}
              max={100}
              unit="%"
              label={t('background.opacity')}
            />
          </div>

          {/* 模糊滑块 */}
          <div className="mb-4">
            <SliderInput
              value={backgroundSettings.blur}
              onChange={(v) => handleSettingChange({ blur: v })}
              min={0}
              max={20}
              unit="px"
              label={t('background.blur')}
            />
          </div>

          {/* 填充方式 */}
          <div className="mb-4">
            <label className="text-sm mb-2 block" style={{ color: theme.ui.textSecondary }}>
              {t('background.fitMode')}
            </label>
            <div className="flex gap-2 flex-wrap">
              {fitModes.map(mode => (
                <button
                  key={mode}
                  onClick={() => handleSettingChange({ fitMode: mode })}
                  className="px-3 py-1.5 rounded-lg text-sm transition-colors"
                  style={{
                    backgroundColor: backgroundSettings.fitMode === mode ? theme.ui.accent : theme.ui.surface2,
                    color: backgroundSettings.fitMode === mode ? '#fff' : theme.ui.textPrimary,
                  }}
                >
                  {t(`background.fitMode.${mode}`)}
                </button>
              ))}
            </div>
          </div>

          {/* 位置 */}
          <div className="mb-4">
            <label className="text-sm mb-2 block" style={{ color: theme.ui.textSecondary }}>
              {t('background.position')}
            </label>
            <div className="flex gap-2 flex-wrap">
              {positions.map(pos => (
                <button
                  key={pos}
                  onClick={() => handleSettingChange({ position: pos })}
                  className="px-3 py-1.5 rounded-lg text-sm transition-colors"
                  style={{
                    backgroundColor: backgroundSettings.position === pos ? theme.ui.accent : theme.ui.surface2,
                    color: backgroundSettings.position === pos ? '#fff' : theme.ui.textPrimary,
                  }}
                >
                  {t(`background.position.${pos}`)}
                </button>
              ))}
            </div>
          </div>

          {/* 应用范围 */}
          <div className="mb-4">
            <label className="text-sm mb-2 block" style={{ color: theme.ui.textSecondary }}>
              {t('background.scope')}
            </label>
            <div className="flex gap-2 flex-wrap">
              {scopes.map(scope => (
                <button
                  key={scope}
                  onClick={() => handleSettingChange({ scope: scope })}
                  className="px-3 py-1.5 rounded-lg text-sm transition-colors"
                  style={{
                    backgroundColor: backgroundSettings.scope === scope ? theme.ui.accent : theme.ui.surface2,
                    color: backgroundSettings.scope === scope ? '#fff' : theme.ui.textPrimary,
                  }}
                >
                  {t(`background.scope.${scope}`)}
                </button>
              ))}
            </div>
          </div>

          {/* 重置按钮 */}
          <button
            onClick={handleDelete}
            className="w-full px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors hover:opacity-80"
            style={{ backgroundColor: theme.ui.surface2, color: theme.ui.textPrimary }}
          >
            <RotateCcw size={16} />
            {t('background.reset')}
          </button>
        </div>
      )}

      {/* 填充方式说明 */}
      <div
        className="p-4 rounded-xl text-sm"
        style={{ backgroundColor: theme.ui.surface1, color: theme.ui.textMuted }}
      >
        {t('background.fitModeTips')}
      </div>
    </div>
  )
}

// 缩略图组件
function SavedImageThumbnail({
  image,
  isSelected,
  onSelect,
  onDelete,
  getThumbnailUrl,
  theme,
}: {
  image: BackgroundFileInfo
  isSelected: boolean
  onSelect: () => void
  onDelete: (e: React.MouseEvent) => void
  getThumbnailUrl: (filename: string) => Promise<string>
  theme: any
}) {
  const [thumbnailUrl, setThumbnailUrl] = useState<string>('')

  useEffect(() => {
    getThumbnailUrl(image.name).then(setThumbnailUrl)
  }, [image.name])

  return (
    <div
      onClick={onSelect}
      className={`relative aspect-square rounded-lg overflow-hidden cursor-pointer group ${isSelected ? 'ring-2 ring-offset-1' : ''}`}
      style={{
        backgroundColor: theme.ui.surface1,
        ...(isSelected && { borderColor: theme.ui.accent }),
      }}
    >
      {thumbnailUrl ? (
        <img src={thumbnailUrl} alt={image.name} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <Image size={16} style={{ color: theme.ui.textMuted }} />
        </div>
      )}
      {/* 删除按钮 */}
      <button
        onClick={onDelete}
        className="absolute top-1 right-1 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
      >
        <Trash2 size={12} style={{ color: '#fff' }} />
      </button>
      {/* 选中标记 */}
      {isSelected && (
        <div
          className="absolute inset-0 border-2 rounded-lg pointer-events-none"
          style={{ borderColor: theme.ui.accent }}
        />
      )}
    </div>
  )
}