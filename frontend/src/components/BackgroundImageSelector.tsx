import { useState, useEffect } from 'react'
import { Upload, Trash } from 'lucide-react'
import { useSettingsStore } from '../stores/settingsStore'
import { useLocale } from '../stores/localeStore'
import { api, BackgroundFileInfo } from '../api/wails'
import { SliderInput } from './ui'

// 背景图片选择器（带预览）
export function BackgroundImageSelector({
  selected,
  onSelect,
  opacity,
  blur,
  onOpacityChange,
  onBlurChange
}: {
  selected: string
  onSelect: (filename: string) => void
  opacity: number
  blur: number
  onOpacityChange: (value: number) => void
  onBlurChange: (value: number) => void
}) {
  const { t } = useLocale()
  const theme = useSettingsStore.getState().getTheme()
  const [images, setImages] = useState<BackgroundFileInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  // 加载已保存图片列表
  useEffect(() => {
    loadImages()
  }, [])

  const loadImages = async () => {
    setLoading(true)
    try {
      const list = await api.listBackgroundImages()
      setImages(list || [])
    } catch (e) {
      console.error('Failed to load saved images:', e)
    } finally {
      setLoading(false)
    }
  }

  // 加载预览图片
  useEffect(() => {
    if (!selected) {
      setPreviewUrl(null)
      return
    }
    const loadPreview = async () => {
      try {
        const base64Data = await api.loadBackgroundImage(selected)
        const ext = selected.toLowerCase().split('.').pop()
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
        console.error('Failed to load preview:', e)
        setPreviewUrl(null)
      }
    }
    loadPreview()
  }, [selected])

  // 上传新图片
  const handleUpload = async () => {
    try {
      setUploading(true)
      const filePath = await api.selectFile(t('background.selectImage'), '', 'Image Files:*.png;*.jpg;*.jpeg;*.gif;*.webp;*.bmp')
      if (filePath) {
        const filename = filePath.split('/').pop() || filePath.split('\\').pop() || 'background.png'
        const base64Data = await api.readFileBase64(filePath)
        const savedName = await api.saveBackgroundImage(base64Data, filename)
        await loadImages()
        onSelect(savedName)
      }
    } catch (e) {
      console.error('Failed to upload image:', e)
    } finally {
      setUploading(false)
    }
  }

  // 删除图片
  const handleDelete = async (filename: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await api.deleteBackgroundImage(filename)
      if (selected === filename) {
        onSelect('')
      }
      await loadImages()
    } catch (err) {
      console.error('Failed to delete:', err)
    }
  }

  return (
    <div className="space-y-3">
      {/* 预览区域 */}
      <div
        className="w-full h-24 rounded-lg overflow-hidden relative"
        style={{ backgroundColor: theme.ui.surface2, border: `1px solid ${theme.ui.border}` }}
      >
        {previewUrl ? (
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `url(${previewUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              opacity: opacity / 100,
              filter: blur > 0 ? `blur(${blur}px)` : undefined,
            }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center" style={{ color: theme.ui.textMuted }}>
            <span className="text-xs">{loading ? t('common.loading') : t('background.noImage')}</span>
          </div>
        )}
        {/* 当前图片名称 */}
        {selected && (
          <div
            className="absolute bottom-0 left-0 right-0 px-2 py-1 text-xs truncate"
            style={{ backgroundColor: 'rgba(0,0,0,0.5)', color: '#fff' }}
          >
            {selected}
          </div>
        )}
      </div>

      {/* 已保存图片列表 */}
      {images.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs" style={{ color: theme.ui.textMuted }}>{t('background.savedImages')}</div>
          <div className="grid grid-cols-4 gap-1">
            {images.map(img => (
              <div
                key={img.name}
                className="relative aspect-square rounded overflow-hidden cursor-pointer transition-all"
                style={{
                  border: `2px solid ${selected === img.name ? theme.ui.accent : theme.ui.border}`,
                }}
                onClick={() => onSelect(img.name)}
              >
                <SavedImageThumbnail filename={img.name} />
                {/* 删除按钮 */}
                <button
                  onClick={(e) => handleDelete(img.name, e)}
                  className="absolute top-0 right-0 p-0.5 opacity-0 hover:opacity-100 transition-opacity"
                  style={{ backgroundColor: 'rgba(0,0,0,0.5)', color: '#fff' }}
                >
                  <Trash size={10} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 上传按钮 */}
      <button
        type="button"
        onClick={handleUpload}
        disabled={uploading}
        className="w-full px-3 py-2 rounded text-xs flex items-center justify-center gap-2"
        style={{ backgroundColor: theme.ui.surface2, color: theme.ui.textPrimary, border: `1px solid ${theme.ui.border}` }}
      >
        <Upload size={14} />
        {uploading ? t('background.uploading') : t('background.uploadNew')}
      </button>

      {/* 清除按钮 */}
      {selected && (
        <button
          type="button"
          onClick={() => onSelect('')}
          className="w-full px-3 py-1.5 rounded text-xs"
          style={{ backgroundColor: theme.ui.surface2, color: theme.ui.textPrimary, border: `1px solid ${theme.ui.border}` }}
        >
          {t('background.reset')}
        </button>
      )}

      {/* 透明度和模糊度滑块 */}
      {selected && (
        <div className="grid grid-cols-2 gap-3 pt-2">
          <SliderInput
            value={opacity}
            onChange={onOpacityChange}
            min={10}
            max={100}
            unit="%"
            label={t('session.backgroundOpacity')}
          />
          <SliderInput
            value={blur}
            onChange={onBlurChange}
            min={0}
            max={20}
            unit="px"
            label={t('session.backgroundBlur')}
          />
        </div>
      )}
    </div>
  )
}

// 已保存图片缩略图
function SavedImageThumbnail({ filename }: { filename: string }) {
  const [url, setUrl] = useState<string>('')
  const theme = useSettingsStore.getState().getTheme()

  useEffect(() => {
    const load = async () => {
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
        setUrl(`data:${mimeType};base64,${base64Data}`)
      } catch (e) {
        console.error('Failed to load thumbnail:', e)
      }
    }
    load()
  }, [filename])

  return (
    <div
      className="w-full h-full"
      style={{
        backgroundImage: url ? `url(${url})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundColor: theme.ui.surface3,
      }}
    />
  )
}