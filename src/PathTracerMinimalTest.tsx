/**
 * Minimal Path Tracer Test
 * Isolated test to identify what breaks the path tracer
 */

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { WebGLPathTracer, BlurredEnvMapGenerator, GradientEquirectTexture } from 'three-gpu-pathtracer'
import { PathTracerDemo } from './viewer/pathTracer/PathTracerDemo'
import './PathTracerMinimalTest.css'

function PathTracerMinimalTest() {
  const containerRef = useRef<HTMLDivElement>(null)
  const pathTracerRef = useRef<PathTracerDemo | null>(null)
  const statusRef = useRef<HTMLDivElement>(null)
  const statsRef = useRef<HTMLDivElement>(null)
  
  // State for path tracer settings
  const [isRunning, setIsRunning] = useState(false)
  const [sampleCount, setSampleCount] = useState(0)
  const [bounces, setBounces] = useState(3)
  const [minSamples, setMinSamples] = useState(0)

  useEffect(() => {
    if (!containerRef.current) return

    const container = containerRef.current
    const width = container.clientWidth
    const height = container.clientHeight

    // Create renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(width, height)
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.0
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    container.appendChild(renderer.domElement)

    // Create scene
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x000000)

    // Create camera
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000)
    camera.position.set(3, 2, 5)
    camera.lookAt(0, 0, 0)

    // Create controls
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.05

    // Add ground plane
    const groundGeometry = new THREE.PlaneGeometry(10, 10)
    const groundMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x808080,
      roughness: 0.8,
      metalness: 0.1
    })
    const ground = new THREE.Mesh(groundGeometry, groundMaterial)
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -1
    ground.receiveShadow = true
    scene.add(ground)

    // Add multiple test objects with different materials
    
    // 1. Green diffuse cube
    const cubeGeometry = new THREE.BoxGeometry(1, 1, 1)
    const cubeMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x00ff00,
      roughness: 0.9,
      metalness: 0.0
    })
    const cube = new THREE.Mesh(cubeGeometry, cubeMaterial)
    cube.position.set(-2, 0, 0)
    cube.castShadow = true
    scene.add(cube)

    // 2. Metallic sphere
    const sphereGeometry = new THREE.SphereGeometry(0.5, 32, 32)
    const sphereMaterial = new THREE.MeshStandardMaterial({
      color: 0x8888ff,
      roughness: 0.1,
      metalness: 0.9
    })
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial)
    sphere.position.set(0, 0, 0)
    sphere.castShadow = true
    scene.add(sphere)

    // 3. Glass sphere
    const glassGeometry = new THREE.SphereGeometry(0.6, 32, 32)
    const glassMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.1,
      metalness: 0.0,
      transmission: 0.9,
      thickness: 1.0,
      ior: 1.5,
      transparent: true
    })
    const glassSphere = new THREE.Mesh(glassGeometry, glassMaterial)
    glassSphere.position.set(2, 0, 0)
    glassSphere.castShadow = true
    scene.add(glassSphere)

    // 4. Emissive box (light source)
    const emissiveGeometry = new THREE.BoxGeometry(0.5, 0.5, 0.5)
    const emissiveMaterial = new THREE.MeshStandardMaterial({
      color: 0xffff88,
      emissive: 0xffff88,
      emissiveIntensity: 2.0
    })
    const emissiveBox = new THREE.Mesh(emissiveGeometry, emissiveMaterial)
    emissiveBox.position.set(0, 2, -2)
    scene.add(emissiveBox)

    // Add multiple lights for better illumination
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3)
    scene.add(ambientLight)

    const directionalLight1 = new THREE.DirectionalLight(0xffffff, 1.0)
    directionalLight1.position.set(5, 5, 5)
    directionalLight1.castShadow = true
    directionalLight1.shadow.mapSize.width = 2048
    directionalLight1.shadow.mapSize.height = 2048
    scene.add(directionalLight1)

    const directionalLight2 = new THREE.DirectionalLight(0x88aaff, 0.5)
    directionalLight2.position.set(-5, 3, -5)
    scene.add(directionalLight2)

    // Point light
    const pointLight = new THREE.PointLight(0xffaa88, 1.0, 10)
    pointLight.position.set(0, 2, 2)
    scene.add(pointLight)

    // Create path tracer
    const pathTracer = new PathTracerDemo(
      {
        renderer,
        camera,
        scene,
        controls,
        resolutionScale: 1.0,
        tiles: 1,
        minSamples: 0
      },
      {
        onProgress: (message) => {
          if (statusRef.current) {
            statusRef.current.textContent = message
          }
          console.log('[PathTracerMinimalTest]', message)
        },
        onError: (error) => {
          console.error('[PathTracerMinimalTest] Error:', error)
          if (statusRef.current) {
            statusRef.current.textContent = `Error: ${error.message}`
          }
          setIsRunning(false)
        },
        onReady: () => {
          console.log('[PathTracerMinimalTest] Ready!')
          if (statusRef.current) {
            statusRef.current.textContent = 'Ready - Click Start'
          }
        }
      }
    )

    pathTracerRef.current = pathTracer

    // Handle resize
    const handleResize = () => {
      const newWidth = container.clientWidth
      const newHeight = container.clientHeight
      camera.aspect = newWidth / newHeight
      camera.updateProjectionMatrix()
      renderer.setSize(newWidth, newHeight)
    }
    window.addEventListener('resize', handleResize)

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize)
      pathTracer.dispose()
      renderer.dispose()
      container.removeChild(renderer.domElement)
    }
  }, [])
  
  // Separate effect for updating stats
  useEffect(() => {
    if (!isRunning) {
      setSampleCount(0)
      return
    }
    
    const statsInterval = setInterval(() => {
      if (pathTracerRef.current) {
        try {
          const samples = pathTracerRef.current.getSampleCount()
          setSampleCount(samples)
        } catch (e) {
          // Ignore errors if method doesn't exist
        }
      }
    }, 100)
    
    return () => clearInterval(statsInterval)
  }, [isRunning])

  const handleStart = async () => {
    if (pathTracerRef.current && !isRunning) {
      try {
        setIsRunning(true)
        if (statusRef.current) {
          statusRef.current.textContent = 'Initializing...'
        }
        await pathTracerRef.current.initialize()
        
        // Update settings
        pathTracerRef.current.setBounces(bounces)
        pathTracerRef.current.setMinSamples(minSamples)
        
        pathTracerRef.current.start()
        if (statusRef.current) {
          statusRef.current.textContent = 'Running...'
        }
      } catch (error) {
        console.error('[PathTracerMinimalTest] Error starting path tracer:', error)
        setIsRunning(false)
        if (statusRef.current) {
          statusRef.current.textContent = `Error: ${error instanceof Error ? error.message : String(error)}`
        }
      }
    }
  }

  const handleStop = () => {
    if (pathTracerRef.current && isRunning) {
      pathTracerRef.current.stop()
      setIsRunning(false)
      setSampleCount(0)
      if (statusRef.current) {
        statusRef.current.textContent = 'Stopped'
      }
    }
  }

  return (
    <div className="path-tracer-minimal-test">
      <div className="controls-panel">
        <h2>Path Tracer Minimal Test</h2>
        <div ref={statusRef} className="status">Initializing...</div>
        
        {/* Stats Display */}
        {isRunning && (
          <div ref={statsRef} className="stats">
            <div className="stat-item">
              <span className="stat-label">Samples:</span>
              <span className="stat-value">{sampleCount}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Bounces:</span>
              <span className="stat-value">{bounces}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Min Samples:</span>
              <span className="stat-value">{minSamples}</span>
            </div>
          </div>
        )}
        
        {/* Controls */}
        <div className="settings">
          <div className="setting-item">
            <label htmlFor="bounces">Bounces:</label>
            <input
              id="bounces"
              type="number"
              min="1"
              max="10"
              value={bounces}
              onChange={(e) => setBounces(Math.max(1, Math.min(10, parseInt(e.target.value) || 3)))}
              disabled={isRunning}
            />
          </div>
          <div className="setting-item">
            <label htmlFor="minSamples">Min Samples:</label>
            <input
              id="minSamples"
              type="number"
              min="0"
              max="100"
              value={minSamples}
              onChange={(e) => setMinSamples(Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
              disabled={isRunning}
            />
          </div>
        </div>
        
        <div className="buttons">
          <button onClick={handleStart} disabled={isRunning}>Start</button>
          <button onClick={handleStop} disabled={!isRunning}>Stop</button>
        </div>
      </div>
      <div ref={containerRef} className="canvas-container" />
    </div>
  )
}

export default PathTracerMinimalTest


