/**
 * Revit Live Link Sync Manager
 * 
 * Manages WebSocket connection to Revit sync server and handles
 * real-time model updates from Revit.
 */

import { GLTFLoader } from 'three-stdlib'
import * as THREE from 'three'

export interface RevitSyncConfig {
  serverUrl?: string
  wsUrl?: string
  sessionId?: string
  autoLoad?: boolean
  optimizationLevel?: 'low' | 'medium' | 'high' | 'none'
}

export interface RevitModelUpdate {
  type: 'MODEL_UPDATE' | 'MODEL_DELETE' | 'ROOM_UPDATE'
  sessionId: string
  fileName: string
  fileSize: number
  fileUrl: string
  timestamp: string
  optimizationLevel?: string
  enableInstancing?: boolean
  simplifyGeometry?: boolean
}

export class RevitSyncManager {
  private ws: WebSocket | null = null
  private config: RevitSyncConfig
  private reconnectAttempts = 0
  private maxReconnectAttempts = 10
  private reconnectDelay = 3000
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private isConnected = false
  private clientId: string | null = null
  private shouldReconnect = true
  private onModelUpdateCallback: ((update: RevitModelUpdate) => Promise<void>) | null = null
  private onConnectionChangeCallback: ((connected: boolean) => void) | null = null

  constructor(config: RevitSyncConfig = {}) {
    this.config = {
      serverUrl: config.serverUrl || 'http://localhost:3002',
      wsUrl: config.wsUrl || 'ws://localhost:3003',
      sessionId: config.sessionId,
      autoLoad: config.autoLoad !== false,
      optimizationLevel: config.optimizationLevel || 'medium'
    }
  }

  /**
   * Connect to Revit sync server
   */
  async connect(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('[RevitSync] Already connected')
      return
    }

    this.shouldReconnect = true

    return new Promise((resolve, reject) => {
      try {
        const wsUrl = this.config.wsUrl!
        console.log(`[RevitSync] Connecting to ${wsUrl}...`)

        this.ws = new WebSocket(wsUrl)

        this.ws.onopen = () => {
          console.log('[RevitSync] Connected to server')
          this.isConnected = true
          this.reconnectAttempts = 0
          this.onConnectionChangeCallback?.(true)

          // Subscribe to session if provided
          if (this.config.sessionId) {
            this.subscribe(this.config.sessionId)
          }

          resolve()
        }

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data)
            this.handleMessage(message)
          } catch (error) {
            console.error('[RevitSync] Error parsing message:', error)
          }
        }

        this.ws.onerror = (error) => {
          console.error('[RevitSync] WebSocket error:', error)
          this.isConnected = false
          this.onConnectionChangeCallback?.(false)
          reject(error)
        }

        this.ws.onclose = () => {
          console.log('[RevitSync] Connection closed')
          this.isConnected = false
          this.onConnectionChangeCallback?.(false)
          if (this.shouldReconnect) {
            this.attemptReconnect()
          }
        }
      } catch (error) {
        console.error('[RevitSync] Connection error:', error)
        reject(error)
      }
    })
  }

  /**
   * Disconnect from server
   */
  disconnect(): void {
    this.shouldReconnect = false

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }

    this.isConnected = false
    this.onConnectionChangeCallback?.(false)
    console.log('[RevitSync] Disconnected')
  }

  /**
   * Subscribe to a specific Revit session
   */
  subscribe(sessionId: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[RevitSync] Cannot subscribe: not connected')
      return
    }

    this.config.sessionId = sessionId
    this.ws.send(JSON.stringify({
      type: 'SUBSCRIBE',
      sessionId
    }))
  }

  /**
   * Set callback for model updates
   */
  onModelUpdate(callback: (update: RevitModelUpdate) => Promise<void>): void {
    this.onModelUpdateCallback = callback
  }

  /**
   * Set callback for connection status changes
   */
  onConnectionChange(callback: (connected: boolean) => void): void {
    this.onConnectionChangeCallback = callback
  }

  /**
   * Get connection status
   */
  get isConnectedToServer(): boolean {
    return this.isConnected && this.ws?.readyState === WebSocket.OPEN
  }

  /**
   * Get client ID
   */
  get getClientId(): string | null {
    return this.clientId
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(message: any): void {
    switch (message.type) {
      case 'CONNECTED':
        this.clientId = message.clientId
        console.log(`[RevitSync] Connected as ${this.clientId}`)
        break

      case 'SUBSCRIBED':
        console.log(`[RevitSync] Subscribed to session: ${message.sessionId}`)
        break

      case 'MODEL_UPDATE':
        this.handleModelUpdate(message as RevitModelUpdate)
        break

      case 'PONG':
        // Heartbeat response
        break

      default:
        console.log(`[RevitSync] Unknown message type: ${message.type}`)
    }
  }

  /**
   * Handle model update from Revit
   */
  private async handleModelUpdate(update: RevitModelUpdate): Promise<void> {
    console.log('[RevitSync] ========================================')
    console.log('[RevitSync] MODEL_UPDATE received from Revit!')
    console.log('[RevitSync] Session ID:', update.sessionId)
    console.log('[RevitSync] File:', update.fileName)
    console.log('[RevitSync] Size:', `${(update.fileSize / 1024 / 1024).toFixed(2)} MB`)
    console.log('[RevitSync] URL:', update.fileUrl)
    console.log('[RevitSync] Timestamp:', update.timestamp)
    console.log('[RevitSync] ========================================')

    if (this.onModelUpdateCallback) {
      try {
        console.log('[RevitSync] Calling model update callback...')
        await this.onModelUpdateCallback(update)
        console.log('[RevitSync] Model update callback completed')
      } catch (error) {
        console.error('[RevitSync] Error handling model update:', error)
      }
    } else {
      console.warn('[RevitSync] No model update callback registered!')
    }
  }

  /**
   * Attempt to reconnect to server
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[RevitSync] Max reconnection attempts reached')
      return
    }

    this.reconnectAttempts++
    const delay = this.reconnectDelay * Math.min(this.reconnectAttempts, 5)

    console.log(`[RevitSync] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`)

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch((error) => {
        console.error('[RevitSync] Reconnection failed:', error)
      })
    }, delay)
  }

  /**
   * Load GLB model from server URL
   */
  static async loadModelFromUrl(
    fileUrl: string,
    serverUrl: string,
    scene: THREE.Scene,
    onProgress?: (progress: number) => void
  ): Promise<THREE.Group> {
    const fullUrl = fileUrl.startsWith('http') ? fileUrl : `${serverUrl}${fileUrl}`
    console.log(`[RevitSync] Loading model from: ${fullUrl}`)

    const loader = new GLTFLoader()

    return new Promise((resolve, reject) => {
      loader.load(
        fullUrl,
        (gltf) => {
          const model = gltf.scene

          // Mark as Revit model
          model.userData.isModel = true
          model.userData.isImportedModel = true
          model.userData.isRevitModel = true
          model.userData.revitSessionId = fileUrl.split('/').pop()?.split('-')[0]

          // Recursively mark all children
          model.traverse((child) => {
            child.userData.isImportedModel = true
            child.userData.isRevitModel = true
          })

          // Add to scene
          scene.add(model)

          console.log(`[RevitSync] Model loaded successfully: ${model.children.length} root objects`)
          resolve(model)
        },
        (progress) => {
          if (onProgress && progress.total > 0) {
            onProgress((progress.loaded / progress.total) * 100)
          }
        },
        (error) => {
          console.error('[RevitSync] Failed to load model:', error)
          reject(error)
        }
      )
    })
  }
}
