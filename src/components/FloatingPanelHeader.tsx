import type { ReactNode, MouseEvent } from 'react'
import './FloatingPanelHeader.css'

export interface FloatingPanelHeaderProps {
  title: string
  icon?: ReactNode
  onMouseDown?: (event: MouseEvent<HTMLElement>) => void
  isMinimized?: boolean
  onMinimize?: () => void
  onClose?: () => void
  closeTitle?: string
  minimizeTitle?: string
  /** Extra controls rendered before minimize/close (e.g. Place Hotspot). */
  actions?: ReactNode
  /** Optional second row under the title bar (shortcuts, status, etc.). */
  children?: ReactNode
  className?: string
}

/**
 * Shared chrome for floating editor panels: consistent height, icon slot,
 * single-line title, and neutral minimize/close buttons.
 */
export default function FloatingPanelHeader({
  title,
  icon,
  onMouseDown,
  isMinimized = false,
  onMinimize,
  onClose,
  closeTitle = 'Close panel',
  minimizeTitle,
  actions,
  children,
  className = ''
}: FloatingPanelHeaderProps) {
  const resolvedMinimizeTitle =
    minimizeTitle ?? (isMinimized ? 'Maximize panel' : 'Minimize panel')

  return (
    <div
      className={`floating-panel-header${className ? ` ${className}` : ''}`}
      onMouseDown={onMouseDown}
    >
      <div className="floating-panel-header-row">
        <h3 className="floating-panel-header-title">
          {icon != null && icon !== '' && (
            <span className="floating-panel-header-icon" aria-hidden="true">
              {icon}
            </span>
          )}
          <span className="floating-panel-header-label">{title}</span>
        </h3>
        <div className="floating-panel-header-actions">
          {actions}
          {onMinimize && (
            <button
              type="button"
              className="minimize-button"
              onClick={onMinimize}
              title={resolvedMinimizeTitle}
              aria-label={resolvedMinimizeTitle}
              data-no-drag
            >
              {isMinimized ? '□' : '−'}
            </button>
          )}
          {onClose && (
            <button
              type="button"
              className="close-button"
              onClick={onClose}
              title={closeTitle}
              aria-label={closeTitle}
              data-no-drag
            >
              ×
            </button>
          )}
        </div>
      </div>
      {children}
    </div>
  )
}
