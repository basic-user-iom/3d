import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { applyYouTubeIframeEmbedFlags, extractYouTubeId } from '../utils/hotspotUtils'
import './HotspotVideoOverlay.css'

export type HotspotVideoOverlayPlacement =
  | 'center'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'

export interface HotspotVideoOverlayProps {
  videoUrlOrId: string
  title?: string
  placement?: HotspotVideoOverlayPlacement
  autoPlay?: boolean
  onClose: () => void
}

function buildEmbedSrc(videoId: string, autoPlay: boolean): string {
  const params = new URLSearchParams({
    controls: '1',
    rel: '0',
    modestbranding: '1',
    playsinline: '1',
    enablejsapi: '1'
  })
  if (typeof window !== 'undefined' && window.location?.origin?.startsWith('http')) {
    params.set('origin', window.location.origin)
  }
  if (autoPlay) {
    params.set('autoplay', '1')
    // Muted autoplay is required by most browsers; user can unmute in the player.
    params.set('mute', '1')
  }
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`
}

export default function HotspotVideoOverlay({
  videoUrlOrId,
  title = 'Video',
  placement = 'center',
  autoPlay = true,
  onClose
}: HotspotVideoOverlayProps) {
  const shellRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const videoId = useMemo(() => extractYouTubeId(videoUrlOrId), [videoUrlOrId])
  const embedSrc = useMemo(
    () => (videoId ? buildEmbedSrc(videoId, autoPlay) : null),
    [videoId, autoPlay]
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {})
        } else {
          onClose()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  const toggleFullscreen = useCallback(async () => {
    const el = shellRef.current
    if (!el) return
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else {
        await el.requestFullscreen()
      }
    } catch (error) {
      console.warn('[HotspotVideoOverlay] Fullscreen failed:', error)
    }
  }, [])

  if (!embedSrc) {
    return createPortal(
      <div className="hotspot-video-overlay-root" role="dialog" aria-modal="true">
        <div className="hotspot-video-overlay-backdrop" onClick={onClose} />
        <div className={`hotspot-video-overlay-shell placement-${placement}`}>
          <div className="hotspot-video-overlay-header">
            <h3>{title}</h3>
            <button type="button" onClick={onClose} aria-label="Close">✕</button>
          </div>
          <div className="hotspot-video-overlay-error">Invalid YouTube URL or ID</div>
        </div>
      </div>,
      document.body
    )
  }

  return createPortal(
    <div className="hotspot-video-overlay-root" role="dialog" aria-modal="true" aria-label={title}>
      <div className="hotspot-video-overlay-backdrop" onClick={onClose} />
      <div
        ref={shellRef}
        className={`hotspot-video-overlay-shell placement-${placement}${isFullscreen ? ' is-fullscreen' : ''}`}
      >
        <div className="hotspot-video-overlay-header">
          <h3>{title}</h3>
          <div className="hotspot-video-overlay-actions">
            <button type="button" onClick={toggleFullscreen} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
              {isFullscreen ? '⤓' : '⛶'}
            </button>
            <button type="button" onClick={onClose} title="Close" aria-label="Close">✕</button>
          </div>
        </div>
        <div className="hotspot-video-overlay-frame">
          <iframe
            title={title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            ref={(el) => {
              if (!el) return
              applyYouTubeIframeEmbedFlags(el)
              if (el.dataset.embedSrc !== embedSrc) {
                el.dataset.embedSrc = embedSrc
                el.src = embedSrc
              }
            }}
          />
        </div>
      </div>
    </div>,
    document.body
  )
}
