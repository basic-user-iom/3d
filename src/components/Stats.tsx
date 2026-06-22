import { useEffect, useRef } from 'react'
import { useAppStore } from '../store/useAppStore'
import { useViewer } from '../viewer/useViewer'
import * as THREE from 'three'
import './Stats.css'

export default function Stats() {
  const { showStats } = useAppStore()
  const { viewer } = useViewer()
  const statsRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<number | undefined>(undefined)
  const dragStateRef = useRef<{
    dragging: boolean
    startX: number
    startY: number
    originX: number
    originY: number
  }>({ dragging: false, startX: 0, startY: 0, originX: 20, originY: 20 })

  useEffect(() => {
    if (!showStats || !viewer || !statsRef.current) return

    const statsDiv = statsRef.current
    let lastTime = performance.now()
    let frameCount = 0
    let fps = 0

    const update = () => {
      frameRef.current = requestAnimationFrame(update)
      frameCount++
      const currentTime = performance.now()
      
      if (currentTime >= lastTime + 1000) {
        fps = frameCount
        frameCount = 0
        lastTime = currentTime
        
        const sceneInfo = {
          objects: 0,
          meshes: 0,
          vertices: 0,
          triangles: 0
        }
        
        viewer.scene.traverse((obj) => {
          sceneInfo.objects++
          if (obj instanceof THREE.Mesh) {
            sceneInfo.meshes++
            const geom = obj.geometry
            if (geom) {
              if (geom.attributes.position) {
                sceneInfo.vertices += geom.attributes.position.count
              }
              if (geom.index) {
                sceneInfo.triangles += geom.index.count / 3
              } else if (geom.attributes.position) {
                sceneInfo.triangles += geom.attributes.position.count / 3
              }
            }
          }
        })

        statsDiv.innerHTML = `
          <div class="stat-item">
            <span class="stat-label">FPS:</span>
            <span class="stat-value">${fps}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Objects:</span>
            <span class="stat-value">${sceneInfo.objects}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Meshes:</span>
            <span class="stat-value">${sceneInfo.meshes}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Vertices:</span>
            <span class="stat-value">${sceneInfo.vertices.toLocaleString()}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Triangles:</span>
            <span class="stat-value">${sceneInfo.triangles.toLocaleString()}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Draw Calls:</span>
            <span class="stat-value">${sceneInfo.meshes}</span>
          </div>
        `
      }
    }

    update()

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current)
      }
    }
  }, [showStats, viewer])

  // Drag-to-move behavior
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const state = dragStateRef.current
      if (!state.dragging || !statsRef.current) return
      const deltaX = e.clientX - state.startX
      const deltaY = e.clientY - state.startY
      const nextX = Math.max(8, state.originX + deltaX)
      const nextY = Math.max(8, state.originY - deltaY) // invert for bottom positioning
      statsRef.current.style.left = `${nextX}px`
      statsRef.current.style.bottom = `${nextY}px`
    }

    const handleMouseUp = () => {
      const state = dragStateRef.current
      if (!state.dragging || !statsRef.current) return
      const style = getComputedStyle(statsRef.current)
      const left = parseFloat(style.left || '20')
      const bottom = parseFloat(style.bottom || '20')
      dragStateRef.current = {
        dragging: false,
        startX: 0,
        startY: 0,
        originX: left,
        originY: bottom
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!statsRef.current) return
    const style = getComputedStyle(statsRef.current)
    const originX = parseFloat(style.left || '20')
    const originY = parseFloat(style.bottom || '20')
    dragStateRef.current = {
      dragging: true,
      startX: e.clientX,
      startY: e.clientY,
      originX,
      originY
    }
  }

  if (!showStats) return null

  return <div ref={statsRef} className="stats" onMouseDown={handleMouseDown} />
}

