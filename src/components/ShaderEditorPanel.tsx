import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { useFloatingPanel } from '../hooks/useFloatingPanel'
import { usePanelStacking } from '../hooks/usePanelStacking'
import { useAppStore } from '../store/useAppStore'
import { createCineShaderStage } from '../viewer/effects/CineShaderStage'
import { trackSliderInteraction } from '../utils/sliderTracker'
import './ShaderEditorPanel.css'

// Shader with customizable parameters
const createShaderMaterial = (params: {
  speed: number
  intensity: number
  colorR: number
  colorG: number
  colorB: number
  rotation: number
  glow: number
  vignette: number
}): THREE.ShaderMaterial => {
  const uniforms: { [uniform: string]: THREE.IUniform<any> } = {
    iResolution: { value: new THREE.Vector3(1, 1, 1) },
    iTime: { value: 0 },
    iMouse: { value: new THREE.Vector4(0, 0, 0, 0) },
    uSpeed: { value: params.speed },
    uIntensity: { value: params.intensity },
    uColor: { value: new THREE.Vector3(params.colorR, params.colorG, params.colorB) },
    uRotation: { value: params.rotation },
    uGlow: { value: params.glow },
    uVignette: { value: params.vignette }
  }

  const vertexShader = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `

  const fragmentShader = `
    precision highp float;

    uniform vec3 iResolution;
    uniform float iTime;
    uniform vec4 iMouse;
    uniform float uSpeed;
    uniform float uIntensity;
    uniform vec3 uColor;
    uniform float uRotation;
    uniform float uGlow;
    uniform float uVignette;

    varying vec2 vUv;

    void main() {
      // Use mesh UV coordinates from vertex shader (vUv)
      // vUv represents 0-1 coordinates across the mesh surface
      // This ensures the shader effect aligns with the actual mesh geometry
      vec2 uv = vUv;

      // Centered coordinates (-1 to 1)
      vec2 p = (uv - 0.5) * 2.0;
      // Apply aspect ratio correction based on screen resolution
      p.x *= iResolution.x / iResolution.y;

      // Time with speed control
      float t = iTime * uSpeed;

      // Rotation
      float angle = t * uRotation;
      mat2 rot = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
      p = rot * p;

      // Radial gradient
      float r = length(p);

      // Color based on distance and time with intensity control
      float glowAmount = exp(-6.0 * r) * (0.7 + 0.3 * sin(t * 2.0));
      vec3 baseColor = vec3(0.1, 0.2, 0.4);
      vec3 glowColor = uColor * uGlow;
      vec3 col = baseColor + glowAmount * glowColor * uIntensity;

      // Vignette
      float vignetteAmount = smoothstep(0.8, 0.2, r * (1.0 + uVignette));
      col *= vignetteAmount;

      gl_FragColor = vec4(col, 1.0);
    }
  `

  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true
  })
  mat.depthWrite = true
  return mat
}

interface ShaderParams {
  speed: number
  intensity: number
  colorR: number
  colorG: number
  colorB: number
  rotation: number
  glow: number
  vignette: number
}

export default function ShaderEditorPanel() {
  const { showShaderEditorPanel, toggleShaderEditorPanel } = useAppStore()
  const panelRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const [params, setParams] = useState<ShaderParams>({
    speed: 0.5,
    intensity: 1.0,
    colorR: 1.0,
    colorG: 0.7,
    colorB: 0.3,
    rotation: 0.25,
    glow: 1.0,
    vignette: 0.0
  })

  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const materialRef = useRef<THREE.ShaderMaterial | null>(null)
  const planeRef = useRef<THREE.Mesh | null>(null)
  const uniformsRef = useRef<{
    iResolution: { value: THREE.Vector3 }
    iTime: { value: number }
    iMouse: { value: THREE.Vector4 }
    uSpeed: { value: number }
    uIntensity: { value: number }
    uColor: { value: THREE.Vector3 }
    uRotation: { value: number }
    uGlow: { value: number }
    uVignette: { value: number }
  } | null>(null)
  const rafRef = useRef<number | undefined>(undefined)
  const startTimeRef = useRef<number | null>(null)

  // Stack with other left-side panels
  const PANEL_WIDTH = 400
  const stackingOffset = usePanelStacking({ panelId: 'shaderEditor', anchor: 'left' })
  const { top: panelTop, left: panelLeft, maxHeight, dragging, handleMouseDown } =
    useFloatingPanel(panelRef as React.RefObject<HTMLElement>, {
      anchor: 'left',
      stackingOffset,
      panelWidth: PANEL_WIDTH,
      panelId: 'shaderEditor'
    })

  const resizeRenderer = useCallback(() => {
    const canvas = canvasRef.current
    const renderer = rendererRef.current
    const camera = cameraRef.current
    const uniforms = uniformsRef.current
    if (!canvas || !renderer || !camera || !uniforms) return

    const rect = canvas.getBoundingClientRect()
    const width = Math.max(1, Math.floor(rect.width))
    const height = Math.max(1, Math.floor(rect.height))

    if (canvas.width !== width || canvas.height !== height) {
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      uniforms.iResolution.value.set(width, height, 1)
    }
  }, [])

  const paramsRef = useRef(params)
  paramsRef.current = params

  const initScene = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      console.error('[ShaderPanel] Canvas not found')
      return
    }

    try {
      const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true
      })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
      rendererRef.current = renderer

      // Use current params for material creation
      const currentParams = paramsRef.current
      const material = createShaderMaterial(currentParams)
      
      // Check for shader compilation errors
      if (material.onBeforeCompile !== undefined) {
        console.warn('[ShaderPanel] Material has onBeforeCompile - may interfere')
      }
      
      materialRef.current = material
    
    // Store uniforms reference - Three.js uniforms are objects with .value property
    uniformsRef.current = {
      iResolution: material.uniforms.iResolution as { value: THREE.Vector3 },
      iTime: material.uniforms.iTime as { value: number },
      iMouse: material.uniforms.iMouse as { value: THREE.Vector4 },
      uSpeed: material.uniforms.uSpeed as { value: number },
      uIntensity: material.uniforms.uIntensity as { value: number },
      uColor: material.uniforms.uColor as { value: THREE.Vector3 },
      uRotation: material.uniforms.uRotation as { value: number },
      uGlow: material.uniforms.uGlow as { value: number },
      uVignette: material.uniforms.uVignette as { value: number }
    }

    // Set initial values from current params
    if (uniformsRef.current) {
      uniformsRef.current.uSpeed.value = currentParams.speed
      uniformsRef.current.uIntensity.value = currentParams.intensity
      uniformsRef.current.uColor.value.set(currentParams.colorR, currentParams.colorG, currentParams.colorB)
      uniformsRef.current.uRotation.value = currentParams.rotation
      uniformsRef.current.uGlow.value = currentParams.glow
      uniformsRef.current.uVignette.value = currentParams.vignette
    }

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x02040a)
    scene.fog = new THREE.Fog(0x02040a, 8, 22)
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50)
    camera.position.set(0, 1.8, 5.5)
    cameraRef.current = camera

    // Shared CineShader-style stage model
    const stage = createCineShaderStage(material)
    planeRef.current = stage.screen
    scene.add(stage.group)

    resizeRenderer()

      const loop = (time: number) => {
        if (!rendererRef.current || !sceneRef.current || !cameraRef.current || !uniformsRef.current) {
          return
        }
        if (startTimeRef.current === null) {
          startTimeRef.current = time
        }
        const elapsed = (time - startTimeRef.current) / 1000
        uniformsRef.current.iTime.value = elapsed

        resizeRenderer()
        try {
          rendererRef.current.render(sceneRef.current, cameraRef.current)
        } catch (error) {
          console.error('[ShaderPanel] Render error:', error)
          return
        }
        rafRef.current = requestAnimationFrame(loop)
      }

      rafRef.current = requestAnimationFrame(loop)
      console.log('[ShaderPanel] Scene initialized successfully')
    } catch (error) {
      console.error('[ShaderPanel] Failed to initialize scene:', error)
    }
  }, [resizeRenderer])

  const disposeScene = useCallback(() => {
    if (rafRef.current !== undefined) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = undefined
    }

    if (planeRef.current) {
      if (planeRef.current.geometry) {
        planeRef.current.geometry.dispose()
      }
      if (planeRef.current.material) {
        ;(planeRef.current.material as THREE.Material).dispose()
      }
      planeRef.current = null
    }

    if (sceneRef.current) {
      sceneRef.current.clear()
      sceneRef.current = null
    }

    if (rendererRef.current) {
      rendererRef.current.dispose()
      rendererRef.current = null
    }

    materialRef.current = null
    uniformsRef.current = null
    cameraRef.current = null
    startTimeRef.current = null
  }, [])

  // Update uniforms when params change - this runs on every slider change
  useEffect(() => {
    if (!uniformsRef.current) {
      // Uniforms not ready yet, will be set in initScene
      return
    }

    // Update all uniforms immediately when params change
    uniformsRef.current.uSpeed.value = params.speed
    uniformsRef.current.uIntensity.value = params.intensity
    // uColor is a Vector3, so use .value.set()
    uniformsRef.current.uColor.value.set(params.colorR, params.colorG, params.colorB)
    uniformsRef.current.uRotation.value = params.rotation
    uniformsRef.current.uGlow.value = params.glow
    uniformsRef.current.uVignette.value = params.vignette

    // Force uniform update (Three.js sometimes needs this)
    if (materialRef.current) {
      materialRef.current.uniformsNeedUpdate = true
      // Also mark material as needing update
      materialRef.current.needsUpdate = true
    }

    // Debug log (can be removed later)
    if (process.env.NODE_ENV === 'development') {
      console.log('[ShaderPanel] Uniforms updated:', {
        speed: params.speed,
        intensity: params.intensity,
        color: [params.colorR, params.colorG, params.colorB],
        rotation: params.rotation,
        glow: params.glow,
        vignette: params.vignette
      })
    }
  }, [params])

  // Initialize / dispose when panel mounts/unmounts
  useEffect(() => {
    if (!showShaderEditorPanel) {
      disposeScene()
      return
    }
    initScene()

    const handleResize = () => {
      resizeRenderer()
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      disposeScene()
    }
  }, [showShaderEditorPanel, initScene, disposeScene, resizeRenderer])

  // Mouse interaction for iMouse
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const uniforms = uniformsRef.current
    if (!uniforms) return

    const rect = () => canvas.getBoundingClientRect()

    const handleMouseMove = (event: MouseEvent) => {
      if (!uniformsRef.current) return
      const r = rect()
      const x = event.clientX - r.left
      const y = r.height - (event.clientY - r.top)
      uniformsRef.current.iMouse.value.set(x, y, uniformsRef.current.iMouse.value.z, uniformsRef.current.iMouse.value.w)
    }

    const handleMouseDown = (event: MouseEvent) => {
      if (!uniformsRef.current) return
      const r = rect()
      const x = event.clientX - r.left
      const y = r.height - (event.clientY - r.top)
      uniformsRef.current.iMouse.value.set(x, y, x, y)
    }

    const handleMouseUp = () => {
      if (!uniformsRef.current) return
      uniformsRef.current.iMouse.value.z = 0
      uniformsRef.current.iMouse.value.w = 0
    }

    canvas.addEventListener('mousemove', handleMouseMove)
    canvas.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      canvas.removeEventListener('mousemove', handleMouseMove)
      canvas.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [showShaderEditorPanel])

  // Map parameter keys to user-friendly display names
  const getSliderDisplayName = (key: keyof ShaderParams): string => {
    const displayNames: Record<keyof ShaderParams, string> = {
      speed: 'Speed',
      intensity: 'Intensity',
      colorR: 'Color R',
      colorG: 'Color G',
      colorB: 'Color B',
      rotation: 'Rotation',
      glow: 'Glow',
      vignette: 'Vignette'
    }
    return displayNames[key] || key
  }

  const updateParam = useCallback((key: keyof ShaderParams, value: number) => {
    trackSliderInteraction(getSliderDisplayName(key), value, 'shaderEditor', () => {
      setParams(prev => ({ ...prev, [key]: value }))
    })
  }, [])

  if (!showShaderEditorPanel) return null

  return (
    <div
      ref={panelRef}
      className={`shader-editor-panel ${dragging ? 'dragging' : ''}`}
      style={{
        top: `${panelTop}px`,
        left: `${panelLeft}px`,
        maxHeight: `${maxHeight}px`
      }}
    >
      <div className="shader-editor-header" onMouseDown={handleMouseDown}>
        <div className="shader-editor-header-left">
          <h3>Shader Effects</h3>
          <span className="shader-editor-subtitle">Real-time shader controls</span>
        </div>
        <div className="shader-editor-header-right">
          <button
            className="shader-editor-close-button"
            onClick={toggleShaderEditorPanel}
            title="Close shader editor"
            data-no-drag
          >
            ×
          </button>
        </div>
      </div>

      <div className="shader-editor-content">
        <div className="shader-editor-left">
          <div className="shader-controls">
            <div className="shader-control-group">
              <label>
                <span>Speed</span>
                <span className="shader-value">{params.speed.toFixed(2)}</span>
              </label>
              <input
                type="range"
                min="0"
                max="2"
                step="0.01"
                value={params.speed}
                onChange={(e) => updateParam('speed', parseFloat(e.target.value))}
                className="shader-slider"
              />
            </div>

            <div className="shader-control-group">
              <label>
                <span>Intensity</span>
                <span className="shader-value">{params.intensity.toFixed(2)}</span>
              </label>
              <input
                type="range"
                min="0"
                max="2"
                step="0.01"
                value={params.intensity}
                onChange={(e) => updateParam('intensity', parseFloat(e.target.value))}
                className="shader-slider"
              />
            </div>

            <div className="shader-control-group">
              <label>
                <span>Color R</span>
                <span className="shader-value">{params.colorR.toFixed(2)}</span>
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={params.colorR}
                onChange={(e) => updateParam('colorR', parseFloat(e.target.value))}
                className="shader-slider"
              />
            </div>

            <div className="shader-control-group">
              <label>
                <span>Color G</span>
                <span className="shader-value">{params.colorG.toFixed(2)}</span>
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={params.colorG}
                onChange={(e) => updateParam('colorG', parseFloat(e.target.value))}
                className="shader-slider"
              />
            </div>

            <div className="shader-control-group">
              <label>
                <span>Color B</span>
                <span className="shader-value">{params.colorB.toFixed(2)}</span>
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={params.colorB}
                onChange={(e) => updateParam('colorB', parseFloat(e.target.value))}
                className="shader-slider"
              />
            </div>

            <div className="shader-control-group">
              <label>
                <span>Rotation</span>
                <span className="shader-value">{params.rotation.toFixed(2)}</span>
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={params.rotation}
                onChange={(e) => updateParam('rotation', parseFloat(e.target.value))}
                className="shader-slider"
              />
            </div>

            <div className="shader-control-group">
              <label>
                <span>Glow</span>
                <span className="shader-value">{params.glow.toFixed(2)}</span>
              </label>
              <input
                type="range"
                min="0"
                max="2"
                step="0.01"
                value={params.glow}
                onChange={(e) => updateParam('glow', parseFloat(e.target.value))}
                className="shader-slider"
              />
            </div>

            <div className="shader-control-group">
              <label>
                <span>Vignette</span>
                <span className="shader-value">{params.vignette.toFixed(2)}</span>
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={params.vignette}
                onChange={(e) => updateParam('vignette', parseFloat(e.target.value))}
                className="shader-slider"
              />
            </div>
          </div>
        </div>
        <div className="shader-editor-right">
          <div className="shader-editor-preview-header">
            <span>Preview</span>
            <span className="shader-editor-preview-hint">Real-time shader effects</span>
          </div>
          <div className="shader-editor-preview-container">
            <canvas ref={canvasRef} className="shader-editor-canvas" />
          </div>
          <div className="shader-editor-footer">
            <span>Adjust sliders to change shader effects in real-time</span>
          </div>
        </div>
      </div>
    </div>
  )
}
