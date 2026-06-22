/**
 * Keyboard Navigation Hook
 * 
 * Handles all keyboard shortcuts and smooth navigation for the 3D viewer.
 * Extracted from App.tsx to improve code organization.
 */

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { ViewerInstance } from '../viewer/ViewerCanvas'
import { getSharedViewer } from '../viewer/useViewer'

interface UseKeyboardNavigationProps {
  viewer: ViewerInstance | null
  selectedObject: THREE.Object3D | null
  transformMode: 'translate' | 'rotate' | 'scale' | null
  showCameraViewsPanel: boolean
  setTransformMode: (mode: 'translate' | 'rotate' | 'scale' | null) => void
  toggleCameraViewsPanel: () => void
  setSelectedObject: (object: THREE.Object3D | null) => void
  // Use the same undo action type as the global store; this accepts
  // any of the specific undo action variants used by the app.
  addToUndoStack: (
    action:
      | { type: 'delete'; object: THREE.Object3D; parent: THREE.Object3D | THREE.Scene | null }
      | { type: 'material-change'; mesh: THREE.Mesh; previousMaterial: THREE.Material | THREE.Material[]; newMaterial: THREE.Material | null }
      | { type: 'material-color-change'; material: THREE.Material; property: 'color'; previousValue: THREE.Color; newValue: THREE.Color }
      | {
          type: 'transform-change'
          object: THREE.Object3D
          previousTransform: { position: THREE.Vector3; rotation: THREE.Euler; scale: THREE.Vector3 }
          newTransform: { position: THREE.Vector3; rotation: THREE.Euler; scale: THREE.Vector3 }
        }
      | { type: 'light-add'; light: any }
      | { type: 'light-remove'; light: any }
      | { type: 'light-update'; previous: any; next: any }
  ) => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
}

export function useKeyboardNavigation({
  viewer,
  selectedObject,
  transformMode,
  showCameraViewsPanel,
  setTransformMode,
  toggleCameraViewsPanel,
  setSelectedObject,
  addToUndoStack,
  undo,
  redo,
  canUndo,
  canRedo
}: UseKeyboardNavigationProps) {
  const resolveViewer = (): ViewerInstance | null => getSharedViewer() ?? viewer
  // Track pressed keys for smooth, continuous navigation
  const pressedKeysRef = useRef<Set<string>>(new Set())
  const rafIdRef = useRef<number | null>(null)
  const lastTimeRef = useRef<number | null>(null)
  // Accelerated movement state (in pixels per second for pan; radians/sec for orbit; unitless for zoom)
  const panVelRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const rotVelRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const zoomVelRef = useRef<number>(0)

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      // Allow WASD even when sliders/color inputs are focused; only block true text entry
      const target = event.target as HTMLElement
      if (target) {
        if (target.tagName === 'TEXTAREA' || target.isContentEditable) return
        if (target.tagName === 'INPUT') {
          const input = target as HTMLInputElement
          const t = (input.type || '').toLowerCase()
          const blockTypes = new Set(['text','search','email','password','url','tel','number'])
          if (blockTypes.has(t)) return
        }
      }

      const key = event.key.toLowerCase()
      const isCtrl = event.ctrlKey || event.metaKey
      const isShift = event.shiftKey

      // Global shortcuts (available at any time)
      switch (key) {
        case 'v':
          // Toggle Camera Views panel
          if (!isCtrl && !isShift) {
            toggleCameraViewsPanel()
            event.preventDefault()
          }
          break
        case 'z':
          // Undo (Ctrl+Z) and Redo (Ctrl+Shift+Z)
          if (isCtrl && !isShift) {
            if (canUndo) {
              undo()
            }
            event.preventDefault()
          } else if (isCtrl && isShift) {
            // Redo (Ctrl+Shift+Z)
            if (canRedo) {
              redo()
            }
            event.preventDefault()
          }
          break
        case 'y':
          // Redo (Ctrl+Y)
          if (isCtrl && !isShift) {
            if (canRedo) {
              redo()
            }
            event.preventDefault()
          }
          break
        case 'escape':
        case 'esc':
          // Exit transform mode or close camera views panel
          if (transformMode) {
            setTransformMode(null)
            event.preventDefault()
          } else if (showCameraViewsPanel) {
            toggleCameraViewsPanel()
            event.preventDefault()
          }
          break
      }

      // Mark movement keys as pressed for smooth loop
      const movementKeys = ['w','a','s','d','q','e','arrowleft','arrowright','arrowup','arrowdown','+','-','=','_']
      if (movementKeys.includes(key)) {
        pressedKeysRef.current.add(key)
        if (event.shiftKey) pressedKeysRef.current.add('shift')
        // Start the smooth loop on first movement key press
        if (!rafIdRef.current) {
          const start = (time: number) => {
            const last = lastTimeRef.current ?? time
            const dt = Math.min(0.05, (time - last) / 1000)
            lastTimeRef.current = time

            const activeViewer = resolveViewer()
            if (activeViewer?.controls && activeViewer?.camera && activeViewer?.renderer) {
              const controls: any = activeViewer.controls
              const camera: any = activeViewer.camera
              const element = activeViewer.renderer.domElement
              const shift = pressedKeysRef.current.has('shift')
              // Target acceleration/limits (twinmotion-like: ramp up and smooth)
              const panAccel = shift ? 1800 : 1200 // pixels/s^2
              const panMax = shift ? 900 : 600 // pixels/s
              const rotAccel = shift ? 2.8 : 1.8 // rad/s^2
              const rotMax = shift ? 1.6 : 1.0 // rad/s
              const zoomAccel = shift ? 1.6 : 1.0 // unit/s^2
              const zoomMax = shift ? 1.0 : 0.6 // unit/s (used as exponent rate)
              const damping = 6.0 // general damping (per second)

              const panByPixels = (dx: number, dy: number) => {
                const distance = camera.position.distanceTo(controls.target)
                const worldPerPixel = (2 * Math.tan((camera.fov * Math.PI / 180) / 2) * distance) / element.clientHeight
                const moveX = -dx * worldPerPixel
                const moveY = dy * worldPerPixel
                const forward = new THREE.Vector3()
                camera.getWorldDirection(forward)
                const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize()
                const up = new THREE.Vector3().copy(camera.up).normalize()
                const panVec = new THREE.Vector3().addScaledVector(right, moveX).addScaledVector(up, moveY)
                camera.position.add(panVec)
                controls.target.add(panVec)
              }

              // Resolve input axes
              const panAxis = { x: 0, y: 0 } // pixels/s direction
              if (pressedKeysRef.current.has('a')) panAxis.x += 1
              if (pressedKeysRef.current.has('d')) panAxis.x -= 1
              if (pressedKeysRef.current.has('w')) panAxis.y -= 1
              if (pressedKeysRef.current.has('s') && !selectedObject) panAxis.y += 1
              // Q = Pan down (decrease altitude), E = Pan up (increase altitude)
              // In panByPixels: positive moveY moves camera UP, negative moveY moves camera DOWN
              if (pressedKeysRef.current.has('q')) panAxis.y -= 1  // Q: pan down (negative panAxis.y → negative moveY → camera moves DOWN)
              if (pressedKeysRef.current.has('e')) panAxis.y += 1  // E: pan up (positive panAxis.y → positive moveY → camera moves UP)

              const rotAxis = { x: 0, y: 0 }
              if (pressedKeysRef.current.has('arrowleft')) rotAxis.x += 1
              if (pressedKeysRef.current.has('arrowright')) rotAxis.x -= 1
              if (pressedKeysRef.current.has('arrowup')) rotAxis.y += 1
              if (pressedKeysRef.current.has('arrowdown')) rotAxis.y -= 1

              let zoomAxis = 0
              if (pressedKeysRef.current.has('+') || pressedKeysRef.current.has('=')) zoomAxis += 1
              if (pressedKeysRef.current.has('-') || pressedKeysRef.current.has('_')) zoomAxis -= 1

              // Integrate acceleration with damping and clamp to max
              panVelRef.current.x += panAxis.x * panAccel * dt
              panVelRef.current.y += panAxis.y * panAccel * dt
              const panMag = Math.hypot(panVelRef.current.x, panVelRef.current.y)
              if (panMag > panMax) {
                const k = panMax / (panMag || 1)
                panVelRef.current.x *= k
                panVelRef.current.y *= k
              }
              // Damping
              const panD = Math.exp(-damping * dt)
              panVelRef.current.x *= panD
              panVelRef.current.y *= panD

              rotVelRef.current.x += rotAxis.x * rotAccel * dt
              rotVelRef.current.y += rotAxis.y * rotAccel * dt
              rotVelRef.current.x = Math.max(-rotMax, Math.min(rotMax, rotVelRef.current.x))
              rotVelRef.current.y = Math.max(-rotMax, Math.min(rotMax, rotVelRef.current.y))
              const rotD = Math.exp(-damping * dt)
              rotVelRef.current.x *= rotD
              rotVelRef.current.y *= rotD

              zoomVelRef.current += zoomAxis * zoomAccel * dt
              if (zoomVelRef.current > zoomMax) zoomVelRef.current = zoomMax
              if (zoomVelRef.current < -zoomMax) zoomVelRef.current = -zoomMax
              zoomVelRef.current *= Math.exp(-damping * dt)

              let moved = false
              if (Math.abs(panVelRef.current.x) > 0.001 || Math.abs(panVelRef.current.y) > 0.001) {
                panByPixels(panVelRef.current.x * dt, panVelRef.current.y * dt)
                moved = true
              }
              if (Math.abs(rotVelRef.current.x) > 0.0001) { controls.rotateLeft(rotVelRef.current.x * dt); moved = true }
              if (Math.abs(rotVelRef.current.y) > 0.0001) { controls.rotateUp(rotVelRef.current.y * dt); moved = true }
              if (Math.abs(zoomVelRef.current) > 0.0001) {
                const scale = Math.exp(zoomVelRef.current * dt)
                if (scale > 1) controls.dollyIn(scale)
                else controls.dollyOut(1 / scale)
                moved = true
              }
              if (moved) {
                controls.update()
                activeViewer.requestRender?.()
              }
            }

            if (pressedKeysRef.current.size > 0) {
              rafIdRef.current = requestAnimationFrame(start)
            } else {
              rafIdRef.current = null
              lastTimeRef.current = null
            }
          }
          rafIdRef.current = requestAnimationFrame(start)
        }
      }

      // Navigation shortcuts (Twinmotion-like) using OrbitControls
      const activeViewer = resolveViewer()
      if (activeViewer?.controls && activeViewer?.camera && activeViewer?.renderer) {
        const controls: any = activeViewer.controls
        const camera: any = activeViewer.camera
        const element = activeViewer.renderer.domElement
        const rotateStep = (isShift ? 0.08 : 0.04)
        const pixelStep = (isShift ? 40 : 20)
        const zoomScale = (isShift ? 1.3 : 1.15)

        // Helper: pan by moving camera position and controls.target in camera space
        const panByPixels = (deltaX: number, deltaY: number) => {
          const distance = camera.position.distanceTo(controls.target)
          const worldPerPixel = (2 * Math.tan((camera.fov * Math.PI / 180) / 2) * distance) / element.clientHeight
          const moveX = -deltaX * worldPerPixel
          const moveY = deltaY * worldPerPixel

          // Camera basis vectors
          const forward = new THREE.Vector3()
          camera.getWorldDirection(forward)
          const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize()
          const up = new THREE.Vector3().copy(camera.up).normalize()

          const panVec = new THREE.Vector3()
            .addScaledVector(right, moveX)
            .addScaledVector(up, moveY)

          camera.position.add(panVec)
          controls.target.add(panVec)
        }

        switch (key) {
          case 'arrowleft':
          case 'arrowright':
          case 'arrowup':
          case 'arrowdown':
          case 'w':
          case 'a':
          case 'd':
          case 'q':
          case 'e':
          case '+':
          case '=':
          case '-':
          case '_':
            // Prevent default to avoid scrolling
            event.preventDefault()
            break
          case 's':
            // Avoid interfering with transform mode toggle when object is selected
            if (!selectedObject) {
              event.preventDefault()
            }
            break
          case 'f':
            // Frame the first model or selected object
            if (activeViewer?.scene && activeViewer?.frameObject) {
              if (selectedObject) {
                activeViewer.frameObject(selectedObject, true)
              } else {
                const objects: any[] = []
                activeViewer.scene.traverse((o) => { if ((o as any).userData?.isModel) objects.push(o) })
                if (objects[0]) activeViewer.frameObject(objects[0], true)
              }
            }
            event.preventDefault()
            break
        }
      }

      // Transform mode shortcuts (only if object is selected)
      if (selectedObject) {
        switch (key) {
          case 't':
            if (!isCtrl && !isShift) {
              setTransformMode(transformMode === 'translate' ? null : 'translate')
              event.preventDefault()
            }
            break
          case 'r':
            if (!isCtrl && !isShift) {
              setTransformMode(transformMode === 'rotate' ? null : 'rotate')
              event.preventDefault()
            }
            break
          case 's':
            if (!isCtrl && !isShift) {
              setTransformMode(transformMode === 'scale' ? null : 'scale')
              event.preventDefault()
            }
            break
          case 'delete':
          case 'backspace':
            // Delete selected object
            if (!isCtrl && !isShift) {
              const navViewer = resolveViewer()
              if (navViewer?.scene) {
                // Don't allow deleting helper objects
                if (!selectedObject.userData.isHelper) {
                  const confirmDelete = window.confirm(`Delete "${selectedObject.name || 'Object'}"?`)
                  if (confirmDelete) {
                    // Save to undo stack BEFORE removing
                    const parent = selectedObject.parent
                    addToUndoStack({
                      type: 'delete',
                      object: selectedObject,
                      parent: parent || null
                    })

                    // Remove from scene (but DON'T dispose so we can undo)
                    if (parent) {
                      parent.remove(selectedObject)
                    }

                    // Deselect
                    setSelectedObject(null)
                  }
                }
              }
              event.preventDefault()
            }
            break
        }
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    document.addEventListener('keydown', handleKeyPress)
    const handleKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      pressedKeysRef.current.delete(key)
      if (key === 'shift') pressedKeysRef.current.delete('shift')
    }
    window.addEventListener('keyup', handleKeyUp)
    document.addEventListener('keyup', handleKeyUp)
    const handleBlur = () => {
      pressedKeysRef.current.clear()
    }
    window.addEventListener('blur', handleBlur)
    return () => {
      window.removeEventListener('keydown', handleKeyPress)
      document.removeEventListener('keydown', handleKeyPress)
      window.removeEventListener('keyup', handleKeyUp)
      document.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', handleBlur)
    }
  }, [selectedObject, transformMode, setTransformMode, showCameraViewsPanel, toggleCameraViewsPanel, viewer, setSelectedObject, addToUndoStack, undo, redo, canUndo, canRedo])

  // Smooth navigation loop using pressed keys (always running)
  useEffect(() => {
    const step = (time: number) => {
      const last = lastTimeRef.current ?? time
      const dt = Math.min(0.05, (time - last) / 1000) // clamp dt <= 50ms
      lastTimeRef.current = time

      const activeViewer = resolveViewer()
      if (activeViewer?.controls && activeViewer?.camera && activeViewer?.renderer) {
        const controls: any = activeViewer.controls
        const camera: any = activeViewer.camera
        const element = activeViewer.renderer.domElement

        const shift = pressedKeysRef.current.has('shift')
        const pixelSpeed = (shift ? 220 : 140) * dt // pixels per second
        const rotSpeed = (shift ? 1.6 : 1.0) * dt // radians per second
        const zoomScale = shift ? 1.015 : 1.01 // gentle per-frame scaling

        // helper to pan by pixels (camera space)
        const panByPixels = (dx: number, dy: number) => {
          const distance = camera.position.distanceTo(controls.target)
          const worldPerPixel = (2 * Math.tan((camera.fov * Math.PI / 180) / 2) * distance) / element.clientHeight
          const moveX = -dx * worldPerPixel
          const moveY = dy * worldPerPixel

          const forward = new THREE.Vector3()
          camera.getWorldDirection(forward)
          const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize()
          const up = new THREE.Vector3().copy(camera.up).normalize()

          const panVec = new THREE.Vector3()
            .addScaledVector(right, moveX)
            .addScaledVector(up, moveY)

          camera.position.add(panVec)
          controls.target.add(panVec)
        }

        let moved = false

        // WASD / QE panning
        if (pressedKeysRef.current.has('w')) { panByPixels(0, -pixelSpeed); moved = true }
        if (pressedKeysRef.current.has('s') && !selectedObject) { panByPixels(0, pixelSpeed); moved = true }
        if (pressedKeysRef.current.has('a')) { panByPixels(pixelSpeed, 0); moved = true }
        if (pressedKeysRef.current.has('d')) { panByPixels(-pixelSpeed, 0); moved = true }
        if (pressedKeysRef.current.has('q')) { panByPixels(0, pixelSpeed); moved = true }
        if (pressedKeysRef.current.has('e')) { panByPixels(0, -pixelSpeed); moved = true }

        // Arrow key orbiting
        if (pressedKeysRef.current.has('arrowleft')) { controls.rotateLeft(rotSpeed); moved = true }
        if (pressedKeysRef.current.has('arrowright')) { controls.rotateLeft(-rotSpeed); moved = true }
        if (pressedKeysRef.current.has('arrowup')) { controls.rotateUp(rotSpeed); moved = true }
        if (pressedKeysRef.current.has('arrowdown')) { controls.rotateUp(-rotSpeed); moved = true }

        // Zoom
        if (pressedKeysRef.current.has('+') || pressedKeysRef.current.has('=')) { controls.dollyIn(zoomScale); moved = true }
        if (pressedKeysRef.current.has('-') || pressedKeysRef.current.has('_')) { controls.dollyOut(zoomScale); moved = true }

        if (moved) {
          controls.update()
          activeViewer.requestRender?.()
        }
      }

      // Keep loop running; only moves when keys are pressed
      rafIdRef.current = requestAnimationFrame(step)
    }

    if (!rafIdRef.current) rafIdRef.current = requestAnimationFrame(step)
    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = null
      lastTimeRef.current = null
      pressedKeysRef.current.clear()
    }
  }, [viewer, selectedObject])
}

