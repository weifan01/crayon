import { useState, useRef, useEffect, ReactNode } from 'react'
import { LucideIcon } from 'lucide-react'

interface DraggableDialogProps {
  children: ReactNode
  onClose: () => void
  title?: string
  icon?: LucideIcon
  width?: number
  initialPosition?: { x: number; y: number }
}

export function DraggableDialog({
  children,
  onClose,
  title,
  icon,
  width = 480,
  initialPosition,
}: DraggableDialogProps) {
  const [position, setPosition] = useState(
    initialPosition || { x: (window.innerWidth - width) / 2, y: 80 }
  )
  const [isDragging, setIsDragging] = useState(false)
  const dragOffset = useRef({ x: 0, y: 0 })
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      // 限制对话框位置，确保至少有一部分在屏幕内
      const minX = -width + 100
      const maxX = window.innerWidth - 100
      const minY = 0
      const maxY = window.innerHeight - 100

      setPosition({
        x: Math.max(minX, Math.min(maxX, e.clientX - dragOffset.current.x)),
        y: Math.max(minY, Math.min(maxY, e.clientY - dragOffset.current.y)),
      })
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, width])

  const handleMouseDown = (e: React.MouseEvent) => {
    if (dialogRef.current) {
      const rect = dialogRef.current.getBoundingClientRect()
      dragOffset.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      }
      setIsDragging(true)
    }
  }

  const IconComponent = icon

  return (
    <div
      ref={dialogRef}
      className="dialog-panel flex flex-col"
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        width,
        maxHeight: '85vh',
        zIndex: 1000,
        cursor: isDragging ? 'grabbing' : 'default',
      }}
    >
      {/* 拖拽标题栏 */}
      <div
        className="p-4 border-b border-surface-2 flex items-center justify-between"
        onMouseDown={handleMouseDown}
        style={{ cursor: 'grab', userSelect: 'none' }}
      >
        {title && (
          <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            {IconComponent && <IconComponent size={20} />}
            {title}
          </h3>
        )}
        <button
          onClick={onClose}
          className="p-1 hover:bg-surface-2 rounded text-text-muted"
          style={{ cursor: 'pointer' }}
        >
          ✕
        </button>
      </div>
      <div className="p-4 overflow-y-auto flex-1">
        {children}
      </div>
    </div>
  )
}