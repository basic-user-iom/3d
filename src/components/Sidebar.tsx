import { useState, useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useViewer } from '../viewer/useViewer'
import './Sidebar.css'

export default function Sidebar() {
  const { viewer } = useViewer()
  const [animations, setAnimations] = useState<THREE.AnimationClip[]>([])
  const [selectedAnimation, setSelectedAnimation] = useState<number | null>(null)
  const mixerRef = useRef<THREE.AnimationMixer | null>(null)
  const animationFrameRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (!viewer) return

    // Find animations in the scene
    const clips: THREE.AnimationClip[] = []
    viewer.scene.traverse((obj) => {
      if (obj.userData.isModel && obj.animations) {
        clips.push(...obj.animations)
      }
    })

    setAnimations(clips)
    
    // Cleanup old mixer
    if (mixerRef.current) {
      mixerRef.current.stopAllAction()
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      mixerRef.current = null
    }
  }, [viewer])

  // Animation loop for mixer
  useEffect(() => {
    if (!mixerRef.current || !viewer) return

    const animate = () => {
      if (mixerRef.current && viewer) {
        animationFrameRef.current = requestAnimationFrame(animate)
        mixerRef.current.update(viewer.clock.getDelta())
      }
    }
    animate()

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [viewer, selectedAnimation])

  const handlePlayAnimation = (index: number) => {
    if (!viewer || !animations[index]) return

    // Stop current animation
    if (mixerRef.current) {
      mixerRef.current.stopAllAction()
      mixerRef.current = null
    }

    const clip = animations[index]
    
    // Find the object with this animation
    let targetObject: THREE.Object3D | null = null
    viewer.scene.traverse((obj) => {
      if (obj.userData.isModel && obj.animations?.includes(clip)) {
        targetObject = obj
      }
    })

    if (!targetObject) return

    const mixer = new THREE.AnimationMixer(targetObject)
    const action = mixer.clipAction(clip)
    action.play()
    
    mixerRef.current = mixer
    setSelectedAnimation(index)
  }

  const handleStopAnimation = () => {
    if (mixerRef.current) {
      mixerRef.current.stopAllAction()
      mixerRef.current = null
    }
    setSelectedAnimation(null)
  }

  if (animations.length === 0) return null

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h3>Animations</h3>
        {mixerRef.current && (
          <button onClick={handleStopAnimation} className="stop-button">
            Stop
          </button>
        )}
      </div>
      <div className="sidebar-content">
        {animations.map((clip, index) => (
          <div
            key={index}
            className={`animation-item ${selectedAnimation === index ? 'active' : ''}`}
            onClick={() => handlePlayAnimation(index)}
          >
            <span>{clip.name || `Animation ${index + 1}`}</span>
            <span className="animation-duration">{(clip.duration).toFixed(2)}s</span>
          </div>
        ))}
      </div>
    </div>
  )
}

