import * as THREE from 'three'
import type { LoadedModel } from '../useViewer'

// Lightweight DXF rooms loader focused on Revit room/area polylines.
// Assumes Revit exported rooms/spaces/areas as polylines with REVIT XDATA.

interface RoomExport {
  id: string
  name: string
  number?: string | null
  color: string
  metadata: Record<string, any>
  mesh: THREE.Object3D
}

export async function loadDXF(
  data: ArrayBuffer | string | File
): Promise<LoadedModel> {
  // Normalize to UTF-8 text
  let buffer: ArrayBuffer
  if (data instanceof ArrayBuffer) {
    buffer = data
  } else if (typeof data === 'string') {
    buffer = new TextEncoder().encode(data).buffer
  } else {
    buffer = await data.arrayBuffer()
  }

  const text = new TextDecoder('utf-8').decode(buffer)

  // dxf-parser is CommonJS – import via dynamic require-style default
  const { default: DxfParser }: any = await import('dxf-parser')
  const parser = new DxfParser()

  let dxf: any
  try {
    dxf = parser.parseSync(text)
  } catch (error) {
    console.error('[DXFLoader] Failed to parse DXF file', error)
    throw new Error(
      'Failed to parse DXF file. Please ensure Revit exported rooms/spaces as polylines in DXF format.'
    )
  }

  // Root group for this DXF import
  const rootGroup = new THREE.Group()
  rootGroup.name = 'Revit DXF'

  // Separate child groups so UI can distinguish rooms vs. other geometry
  const roomsGroup = new THREE.Group()
  roomsGroup.name = 'Revit Rooms'
  roomsGroup.userData.isRoomsGroup = true

  const wallsGroup = new THREE.Group()
  wallsGroup.name = 'Revit Walls'
  wallsGroup.userData.isWallsGroup = true

  rootGroup.add(roomsGroup)
  rootGroup.add(wallsGroup)

  const rooms: RoomExport[] = []
  const entities: any[] = Array.isArray(dxf?.entities) ? dxf.entities : []

  // Collect text labels (TEXT / MTEXT) that might contain room names/numbers
  const labels: Array<{ text: string; x: number; y: number; layer?: string }> = []

  try {
    console.log('[DXFLoader] Parsed DXF summary:', {
      entityCount: entities.length,
      entityTypes: Array.from(
        new Set(entities.map((e: any) => (e?.type || '').toUpperCase()))
      )
    })
  } catch {}

  // First pass: gather potential labels
  entities.forEach((entity) => {
    const e: any = entity
    const type = (e.type || '').toUpperCase()

    if (type === 'TEXT' || type === 'MTEXT') {
      const rawText: string =
        (e.text as string) ||
        (e.string as string) ||
        (e.plainText as string) ||
        ''

      const text = (rawText || '').trim()
      if (!text) return

      const pos =
        e.position ||
        e.startPoint ||
        e.insert ||
        (e.x !== undefined && e.y !== undefined
          ? { x: e.x, y: e.y }
          : null)

      if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number') {
        return
      }

      labels.push({
        text,
        x: pos.x,
        y: pos.y,
        layer: e.layer
      })
    }
  })

  try {
    console.log('[DXFLoader] Collected potential labels:', {
      count: labels.length,
      sample: labels.slice(0, 5)
    })
  } catch {}

  const findNearestLabel = (cx: number, cy: number) => {
    if (!labels.length) return null

    let best = null as { text: string; x: number; y: number; layer?: string } | null
    let bestDistSq = Number.POSITIVE_INFINITY

    for (const label of labels) {
      const dx = label.x - cx
      const dy = label.y - cy
      const distSq = dx * dx + dy * dy
      if (distSq < bestDistSq) {
        bestDistSq = distSq
        best = label
      }
    }

    return best
  }

  // Second pass: build room polygons
  entities.forEach((entity, index) => {
    const e: any = entity
    const type = (e.type || '').toUpperCase()

    // Focus on closed polylines (LWPOLYLINE / POLYLINE) which Revit uses for room/area boundaries
    if (type !== 'LWPOLYLINE' && type !== 'POLYLINE') return

    const vertices: Array<{ x: number; y: number }> =
      e.vertices || e.points || []
    if (!vertices || vertices.length < 3) return

    // Extract REVIT XDATA if present – parameter names match Revit room/area params
    // Try a few common shapes that dxf-parser uses for xdata
    const revitData =
      (e.extendedData && (e.extendedData.REVIT || e.extendedData.Revit)) ||
      (e.xdata && (e.xdata.REVIT || e.xdata.Revit)) ||
      []

    if (!revitData || !Array.isArray(revitData) || revitData.length === 0) {
      try {
        console.debug('[DXFLoader] Polyline without REVIT XDATA skipped:', {
          index,
          type,
          layer: e.layer,
          handle: e.handle
        })
      } catch {}
    }

    const metadata: Record<string, any> = {}
    if (Array.isArray(revitData)) {
      revitData.forEach((item: any) => {
        // Heuristic: many parsers expose { key, value } or { name, value }
        const key = item?.key || item?.name
        const value = item?.value
        if (key && value !== undefined) {
          metadata[key] = value
        }
      })
    }

    let name: string =
      (metadata.Name as string) ||
      (metadata.NAME as string) ||
      (e.layer as string) ||
      'Room'
    let number: string | null =
      (metadata.Number as string) || (metadata.NUMBER as string) || null

    // Build 2D shape from vertices, assuming they lie in XY plane
    const shape = new THREE.Shape()
    const first = vertices[0]
    shape.moveTo(first.x, first.y)
    for (let i = 1; i < vertices.length; i++) {
      const v = vertices[i]
      shape.lineTo(v.x, v.y)
    }
    // Close the shape if last point != first
    const last = vertices[vertices.length - 1]
    if (last.x !== first.x || last.y !== first.y) {
      shape.lineTo(first.x, first.y)
    }

    const geometry = new THREE.ShapeGeometry(shape)

    // Give each room a distinct, pleasant color (can be overridden from UI)
    const color = new THREE.Color()
    color.setHSL(((index * 0.137) % 1) * 0.9, 0.55, 0.45)

    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
      depthWrite: false
    })

    const mesh = new THREE.Mesh(geometry, material)
    mesh.userData.isModel = true
    mesh.userData.isRoom = true

    // Try to refine the name and code from nearby text labels (room tags)
    try {
      const xs = vertices.map((v) => v.x)
      const ys = vertices.map((v) => v.y)
      const minX = Math.min(...xs)
      const maxX = Math.max(...xs)
      const minY = Math.min(...ys)
      const maxY = Math.max(...ys)
      const marginX = (maxX - minX) * 0.1 || 1
      const marginY = (maxY - minY) * 0.1 || 1

      const nearLabels = labels.filter((lbl) => {
        return (
          lbl.x >= minX - marginX &&
          lbl.x <= maxX + marginX &&
          lbl.y >= minY - marginY &&
          lbl.y <= maxY + marginY
        )
      })

      if (nearLabels.length > 0) {
        // Sort by Y so top text (room name) comes first
        nearLabels.sort((a, b) => b.y - a.y)

        let inferredName: string | undefined
        let inferredCode: string | null = null

        for (const lbl of nearLabels) {
          const t = (lbl.text || '').trim()
          if (!t) continue

          const hasDigit = /[0-9]/.test(t)
          const isAllLetters = /^[A-Za-z\s]+$/.test(t)

          if (!inferredName && isAllLetters) {
            inferredName = t
            mesh.userData.labelNamePosition = { x: lbl.x, y: lbl.y }
            mesh.userData.labelNameLayer = lbl.layer
            continue
          }

          if (!inferredCode && hasDigit) {
            inferredCode = t
            mesh.userData.labelCodePosition = { x: lbl.x, y: lbl.y }
            mesh.userData.labelCodeLayer = lbl.layer
          }
        }

        // If we only found one label, treat it as name
        if (!inferredName && nearLabels[0]) {
          const t = nearLabels[0].text.trim()
          if (t) inferredName = t
        }

        if (inferredName) {
          name = inferredName
        }
        if (inferredCode) {
          number = inferredCode
        }
      }
    } catch {}

    mesh.name = number ? `${number} - ${name}` : name

    mesh.userData.roomName = name
    mesh.userData.roomNumber = number
    mesh.userData.roomMetadata = metadata

    // Lift slightly above ground to avoid z-fighting with other geometry
    mesh.position.z = mesh.position.z + 0.01

    roomsGroup.add(mesh)

    rooms.push({
      id: `room-${index}`,
      name,
      number,
      color: `#${color.getHexString()}`,
      metadata,
      mesh
    })
  })

  // Third pass: build wall/outline lines as LineSegments
  entities.forEach((entity) => {
    const e: any = entity
    const type = (e.type || '').toUpperCase()

    if (type === 'LINE') {
      // DXF LINE entity
      const start =
        e.startPoint ||
        e.start ||
        (e.vertices && e.vertices[0]) ||
        null
      const end =
        e.endPoint ||
        e.end ||
        (e.vertices && e.vertices[1]) ||
        null

      if (
        !start ||
        !end ||
        typeof start.x !== 'number' ||
        typeof start.y !== 'number' ||
        typeof end.x !== 'number' ||
        typeof end.y !== 'number'
      ) {
        return
      }

      const geometry = new THREE.BufferGeometry()
      const positions = new Float32Array([
        start.x,
        start.y,
        0,
        end.x,
        end.y,
        0
      ])
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

      const material = new THREE.LineBasicMaterial({
        color: 0x222222,
        linewidth: 1
      })

      const line = new THREE.LineSegments(geometry, material)
      line.userData.isRoomOutline = false
      line.userData.isWallLine = true
      line.userData.layer = e.layer

      wallsGroup.add(line)
    }
  })

  if (!rooms.length) {
    console.warn(
      '[DXFLoader] No room polylines with REVIT XDATA detected. Ensure Revit export option "Export rooms, spaces, and areas as polylines" is enabled.'
    )
  } else {
    try {
      console.log('[DXFLoader] Detected Revit rooms:', {
        count: rooms.length,
        sample: rooms.slice(0, 5).map((r) => ({
          id: r.id,
          name: r.name,
          number: r.number,
          metadataKeys: Object.keys(r.metadata)
        }))
      })
    } catch {}
  }

  const loaded: LoadedModel = {
    scene: rootGroup,
    animations: [],
    userData: {
      rooms
    }
  }

  return loaded
}

