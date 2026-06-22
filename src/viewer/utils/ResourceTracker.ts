/**
 * ResourceTracker - Tracks and disposes Three.js resources to prevent memory leaks
 * 
 * This class tracks all Three.js resources (textures, geometries, materials, etc.)
 * and provides a single dispose() method to clean them all up properly.
 */

import * as THREE from 'three'
import { disposeTexturesFromMaterial } from '../useViewer'

export class ResourceTracker {
  private textures = new Set<THREE.Texture>()
  private geometries = new Set<THREE.BufferGeometry>()
  private materials = new Set<THREE.Material>()
  private renderTargets = new Set<THREE.WebGLRenderTarget>()
  private listeners = new Map<EventTarget, { type: string; handler: EventListener; options?: boolean | AddEventListenerOptions }[]>()

  /**
   * Track a texture for disposal
   */
  trackTexture(texture: THREE.Texture): void {
    this.textures.add(texture)
  }

  /**
   * Track a geometry for disposal
   */
  trackGeometry(geometry: THREE.BufferGeometry): void {
    this.geometries.add(geometry)
  }

  /**
   * Track a material for disposal
   */
  trackMaterial(material: THREE.Material): void {
    this.materials.add(material)
  }

  /**
   * Track a render target for disposal
   */
  trackRenderTarget(target: THREE.WebGLRenderTarget): void {
    this.renderTargets.add(target)
  }

  /**
   * Track an event listener for removal
   */
  trackEventListener(
    target: EventTarget,
    type: string,
    handler: EventListener,
    options?: boolean | AddEventListenerOptions
  ): void {
    if (!this.listeners.has(target)) {
      this.listeners.set(target, [])
    }
    this.listeners.get(target)!.push({ type, handler, options })
    target.addEventListener(type, handler, options)
  }

  /**
   * Untrack a texture (if it was disposed elsewhere)
   */
  untrackTexture(texture: THREE.Texture): void {
    this.textures.delete(texture)
  }

  /**
   * Untrack a geometry (if it was disposed elsewhere)
   */
  untrackGeometry(geometry: THREE.BufferGeometry): void {
    this.geometries.delete(geometry)
  }

  /**
   * Untrack a material (if it was disposed elsewhere)
   */
  untrackMaterial(material: THREE.Material): void {
    this.materials.delete(material)
  }

  /**
   * Untrack a render target (if it was disposed elsewhere)
   */
  untrackRenderTarget(target: THREE.WebGLRenderTarget): void {
    this.renderTargets.delete(target)
  }

  /**
   * Dispose all tracked resources
   */
  dispose(): void {
    // Dispose textures
    this.textures.forEach(texture => {
      try {
        texture.dispose()
      } catch (e) {
        console.warn('[ResourceTracker] Error disposing texture:', e)
      }
    })
    this.textures.clear()

    // Dispose geometries
    this.geometries.forEach(geometry => {
      try {
        geometry.dispose()
      } catch (e) {
        console.warn('[ResourceTracker] Error disposing geometry:', e)
      }
    })
    this.geometries.clear()

    // Dispose materials (and their textures)
    this.materials.forEach(material => {
      try {
        // Dispose all textures from material first
        disposeTexturesFromMaterial(material)
        material.dispose()
      } catch (e) {
        console.warn('[ResourceTracker] Error disposing material:', e)
      }
    })
    this.materials.clear()

    // Dispose render targets
    this.renderTargets.forEach(target => {
      try {
        target.dispose()
      } catch (e) {
        console.warn('[ResourceTracker] Error disposing render target:', e)
      }
    })
    this.renderTargets.clear()

    // Remove event listeners
    this.listeners.forEach((handlers, target) => {
      handlers.forEach(({ type, handler, options }) => {
        try {
          target.removeEventListener(type, handler, options)
        } catch (e) {
          console.warn('[ResourceTracker] Error removing event listener:', e)
        }
      })
    })
    this.listeners.clear()
  }

  /**
   * Get statistics about tracked resources
   */
  getStats(): {
    textures: number
    geometries: number
    materials: number
    renderTargets: number
    listeners: number
  } {
    let listenerCount = 0
    this.listeners.forEach(handlers => {
      listenerCount += handlers.length
    })

    return {
      textures: this.textures.size,
      geometries: this.geometries.size,
      materials: this.materials.size,
      renderTargets: this.renderTargets.size,
      listeners: listenerCount
    }
  }
}


























