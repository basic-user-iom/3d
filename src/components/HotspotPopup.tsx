import React, { useEffect, useRef, useState } from 'react'
import { Hotspot } from './HotspotsPanel'
import { extractYouTubeId } from '../utils/hotspotUtils'
import './HotspotPopup.css'

interface HotspotPopupProps {
  hotspot: Hotspot | null
  onClose: () => void
}

export default function HotspotPopup({ hotspot, onClose }: HotspotPopupProps) {
  const popupRef = useRef<HTMLDivElement>(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    if (!hotspot) return

    // Close on escape key
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleEscape)

    // Close on click outside
    const handleClickOutside = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    setTimeout(() => {
      document.addEventListener('click', handleClickOutside)
    }, 100)

    return () => {
      window.removeEventListener('keydown', handleEscape)
      document.removeEventListener('click', handleClickOutside)
    }
  }, [hotspot, onClose])

  if (!hotspot) return null

  const popupSettings = hotspot.content.popupSettings || {}
  const popupStyle: React.CSSProperties = {
    width: popupSettings.width ? `${popupSettings.width}px` : undefined,
    height: popupSettings.height ? `${popupSettings.height}px` : undefined,
    maxWidth: popupSettings.maxWidth ? `${popupSettings.maxWidth}vw` : undefined,
    maxHeight: popupSettings.maxHeight ? `${popupSettings.maxHeight}vh` : undefined,
    backgroundColor: popupSettings.backgroundColor,
    borderRadius: popupSettings.borderRadius ? `${popupSettings.borderRadius}px` : undefined
  }

  const renderContent = (): React.ReactNode => {
    switch (hotspot.content.type) {
      case 'text':
        const formatting = hotspot.content.formatting || {}
        const textStyle: React.CSSProperties = {
          fontFamily: formatting.fontFamily || 'Arial',
          fontSize: `${formatting.fontSize || 16}px`,
          color: formatting.color || '#e0e0e0',
          fontWeight: formatting.bold ? 'bold' : 'normal',
          fontStyle: formatting.italic ? 'italic' : 'normal',
          textDecoration: formatting.underline ? 'underline' : 'none',
          textAlign: formatting.align || 'left',
          lineHeight: '1.6',
          whiteSpace: 'pre-wrap',
          wordWrap: 'break-word',
          padding: formatting.padding ? `${formatting.padding}px` : '0',
          margin: '0',
          backgroundColor: formatting.backgroundColor && formatting.backgroundColor !== 'transparent' ? formatting.backgroundColor : undefined,
          borderRadius: formatting.padding && formatting.padding > 0 ? '4px' : undefined
        }
        
        // Truncate text if not expanded
        const displayText = hotspot.content.data || ''
        const shouldTruncate = !isExpanded && displayText.length > 200
        const truncatedText = shouldTruncate ? displayText.substring(0, 200) + '...' : displayText
        
        return (
          <div className="hotspot-content-text">
            <div className="hotspot-text-content" style={textStyle}>
              {truncatedText}
            </div>
            {shouldTruncate && (
              <button
                className="hotspot-expand-button"
                onClick={() => setIsExpanded(true)}
                style={{ marginTop: '12px', padding: '8px 16px', cursor: 'pointer' }}
              >
                Show more...
              </button>
            )}
            {isExpanded && displayText.length > 200 && (
              <button
                className="hotspot-collapse-button"
                onClick={() => setIsExpanded(false)}
                style={{ marginTop: '12px', padding: '8px 16px', cursor: 'pointer' }}
              >
                Show less
              </button>
            )}
          </div>
        )

      case 'image':
        return (
          <div className="hotspot-content-image">
            <img src={hotspot.content.data} alt={hotspot.name} onError={(e) => {
              (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iIzMzMzMzMyIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM5OTk5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5JbWFnZSBub3QgZm91bmQ8L3RleHQ+PC9zdmc+'
            }} />
          </div>
        )

      case 'youtube':
        const videoId = extractYouTubeId(hotspot.content.data)
        if (videoId) {
          return (
            <div className="hotspot-content-youtube">
              <iframe
                src={`https://www.youtube.com/embed/${videoId}?autoplay=0`}
                title={hotspot.name}
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          )
        }
        return (
          <div className="hotspot-content-error">
            <p>⚠️ Invalid YouTube URL or ID</p>
            <p className="error-details">{hotspot.content.data}</p>
          </div>
        )

      case 'video':
        return (
          <div className="hotspot-content-video">
            <video controls src={hotspot.content.data} onError={(e) => {
              console.error('[HotspotPopup] Failed to load video:', hotspot.content.data)
            }}>
              Your browser does not support the video tag.
            </video>
          </div>
        )

      case 'interactive':
        return (
          <div className="hotspot-content-interactive">
            <iframe src={hotspot.content.data} title={hotspot.name} />
          </div>
        )

      case 'html':
        return (
          <div className="hotspot-content-html">
            <div 
              dangerouslySetInnerHTML={{ __html: hotspot.content.data }}
              style={{
                width: '100%',
                height: '100%',
                overflow: 'auto'
              }}
            />
          </div>
        )

      default:
        return (
          <div className="hotspot-content-empty">
            <p>No content available</p>
          </div>
        )
    }
  }

  const popupClassName = `hotspot-popup ${isMinimized ? 'minimized' : ''} ${isMaximized ? 'maximized' : ''}`

  return (
    <>
      <div className="hotspot-popup-overlay">
        <div 
          ref={popupRef} 
          className={popupClassName}
          onClick={(e) => e.stopPropagation()}
          style={isMaximized ? {} : popupStyle}
        >
          <div className="hotspot-popup-header">
            <h3>{hotspot.name}</h3>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {!isMinimized && (
                <button 
                  className="hotspot-popup-minimize" 
                  onClick={() => setIsMinimized(true)} 
                  title="Minimize"
                >
                  −
                </button>
              )}
              {isMinimized && (
                <button 
                  className="hotspot-popup-maximize" 
                  onClick={() => setIsMinimized(false)} 
                  title="Maximize"
                >
                  □
                </button>
              )}
              {!isMinimized && (
                <button 
                  className="hotspot-popup-maximize-full" 
                  onClick={() => setIsMaximized(!isMaximized)} 
                  title={isMaximized ? "Restore" : "Maximize to full screen"}
                  style={{
                    fontSize: '14px',
                    fontWeight: 'bold',
                    color: '#4a9eff',
                    border: '1px solid #4a9eff',
                    borderRadius: '4px',
                    padding: '6px 12px',
                    minWidth: 'auto',
                    height: '36px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'rgba(74, 158, 255, 0.1)'
                  }}
                >
                  <span>{isMaximized ? '↗' : '⛶'}</span>
                  <span style={{ fontSize: '12px' }}>{isMaximized ? 'Restore' : 'Maximize'}</span>
                </button>
              )}
              <button className="hotspot-popup-close" onClick={onClose} title="Close">
                ✕
              </button>
            </div>
          </div>
          {!isMinimized && (
            <div className="hotspot-popup-content">
              {renderContent()}
            </div>
          )}
        </div>
      </div>
      {isMaximized && (
        <div className="hotspot-popup-maximized-overlay" onClick={() => setIsMaximized(false)}>
          <div 
            className="hotspot-popup-maximized-content"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="hotspot-popup-header">
              <h3>{hotspot.name}</h3>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button 
                  className="hotspot-popup-maximize-full" 
                  onClick={() => setIsMaximized(false)} 
                  title="Restore"
                  style={{
                    fontSize: '14px',
                    fontWeight: 'bold',
                    color: '#4a9eff',
                    border: '1px solid #4a9eff',
                    borderRadius: '4px',
                    padding: '6px 12px',
                    minWidth: 'auto',
                    height: '36px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'rgba(74, 158, 255, 0.1)'
                  }}
                >
                  <span>↗</span>
                  <span style={{ fontSize: '12px' }}>Restore</span>
                </button>
                <button className="hotspot-popup-close" onClick={onClose} title="Close">
                  ✕
                </button>
              </div>
            </div>
            <div className="hotspot-popup-content-maximized">
              {renderContent()}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
