import { useState, useRef } from 'react'
import { useAppStore } from '../store/useAppStore'
import { useViewer } from '../viewer/useViewer'
import { useFloatingPanel } from '../hooks/useFloatingPanel'
import { usePanelStacking } from '../hooks/usePanelStacking'
import './RoomsPanel.css'

function getDisplayName(room: any): { name: string; number?: string | null } {
  const meta = room.metadata || {}

  const nameKeys = [
    'Name',
    'NAME',
    'Room Name',
    'ROOM_NAME',
    'RoomName',
    'Space Name',
    'SPACE_NAME'
  ]
  const numberKeys = ['Number', 'NUMBER', 'Room Number', 'ROOM_NUMBER', 'RoomNumber']

  let displayName: string | undefined =
    typeof room.name === 'string' && room.name && room.name !== 'A-AREA-BNDY'
      ? room.name
      : undefined

  // Prefer explicit name keys from metadata
  if (!displayName) {
    for (const key of nameKeys) {
      const value = meta?.[key]
      if (typeof value === 'string' && value.trim().length > 0) {
        displayName = value.trim()
        break
      }
    }
  }

  // Fallback: first non-empty string value from metadata
  if (!displayName) {
    for (const value of Object.values(meta)) {
      if (typeof value === 'string' && value.trim().length > 0) {
        displayName = value.trim()
        break
      }
    }
  }

  const explicitNumber = room.number ?? null
  let displayNumber: string | null = explicitNumber

  if (!displayNumber) {
    for (const key of numberKeys) {
      const value = meta?.[key]
      if (typeof value === 'string' && value.trim().length > 0) {
        displayNumber = value.trim()
        break
      }
    }
  }

  return {
    name: displayName || room.name || 'Room',
    number: displayNumber
  }
}

export default function RoomsPanel() {
  const {
    showRoomsPanel,
    toggleRoomsPanel,
    rooms,
    selectedRoomId,
    selectRoom,
    updateRoomColor,
    setSelectedObject
  } = useAppStore()

  const { viewer, frameObject } = useViewer()

  const [isMinimized, setIsMinimized] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [hiddenRoomIds, setHiddenRoomIds] = useState<Set<string>>(new Set())

  const panelRef = useRef<HTMLDivElement | null>(null)
  const PANEL_WIDTH = 420
  const stackingOffset = usePanelStacking({ panelId: 'rooms', anchor: 'left' })
  const { top, left, maxHeight, dragging, handleMouseDown } = useFloatingPanel(
    panelRef as React.RefObject<HTMLElement>,
    {
      anchor: 'left',
      stackingOffset,
      panelWidth: PANEL_WIDTH,
      panelId: 'rooms'
    }
  )

  if (!showRoomsPanel) return null

  const handleSelectRoom = (id: string) => {
    const room = rooms.find((r) => r.id === id)
    selectRoom(id)
    if (room && viewer && frameObject) {
      // Mirror Objects panel behavior: select and frame the underlying mesh
      setSelectedObject(room.mesh)
      frameObject(room.mesh)
    }
  }

  const handleColorChange = (id: string, color: string) => {
    updateRoomColor(id, color)
  }

  const handleToggleVisibility = (id: string) => {
    const room = rooms.find((r) => r.id === id)
    if (!room) return

    const mesh = room.mesh as any
    const currentlyVisible = mesh.visible !== false
    mesh.visible = !currentlyVisible

    setHiddenRoomIds((prev) => {
      const next = new Set(prev)
      if (currentlyVisible) {
        next.add(id)
      } else {
        next.delete(id)
      }
      return next
    })
  }

  const filteredRooms = rooms.filter((room) => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()

    const display = getDisplayName(room)

    const nameMatch = display.name.toLowerCase().includes(q)
    const numberMatch =
      (display.number && display.number.toLowerCase().includes(q)) || false

    // Also allow searching in basic metadata string fields (e.g. Department, Occupant)
    let metadataMatch = false
    const meta = room.metadata || {}
    for (const value of Object.values(meta)) {
      if (typeof value === 'string' && value.toLowerCase().includes(q)) {
        metadataMatch = true
        break
      }
    }

    return nameMatch || numberMatch || metadataMatch
  })

  return (
    <div
      ref={panelRef}
      className={`rooms-panel ${dragging ? 'dragging' : ''} ${
        isMinimized ? 'minimized' : ''
      }`}
      style={{
        top,
        left,
        maxHeight
      }}
    >
      <div className="rooms-panel-header" onMouseDown={handleMouseDown}>
        <h3>Revit Rooms</h3>
        <div className="rooms-panel-header-buttons">
          <button
            className="minimize-button"
            onClick={(e) => {
              e.stopPropagation()
              setIsMinimized((prev) => !prev)
            }}
            aria-label={isMinimized ? 'Expand rooms panel' : 'Minimize rooms panel'}
          >
            {isMinimized ? '▢' : '—'}
          </button>
          <button
            className="close-button"
            onClick={(e) => {
              e.stopPropagation()
              toggleRoomsPanel()
            }}
            aria-label="Close rooms panel"
          >
            ×
          </button>
        </div>
      </div>

      {!isMinimized && (
        <div className="rooms-panel-content">
          <div className="rooms-toolbar">
            <input
              type="text"
              placeholder="Search by name or number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <div className="rooms-summary">
              {rooms.length === 0
                ? 'No rooms detected. Load a Revit DXF with rooms as polylines.'
                : `${rooms.length} room${rooms.length === 1 ? '' : 's'}`}
            </div>
          </div>

          <div className="rooms-list">
            {filteredRooms.length === 0 ? (
              <div className="empty-message">No rooms match your search.</div>
            ) : (
              filteredRooms.map((room) => {
                const display = getDisplayName(room)
                const isHidden = hiddenRoomIds.has(room.id)
                return (
                  <div
                    key={room.id}
                    className={`room-row ${
                      selectedRoomId === room.id ? 'selected' : ''
                    } ${isHidden ? 'hidden' : ''}`}
                    onClick={() => handleSelectRoom(room.id)}
                  >
                    <div className="room-main">
                      <div className="room-title">
                        <span className="room-name">{display.name}</span>
                        {display.number && (
                          <span className="room-number">#{display.number}</span>
                        )}
                      </div>
                      <div className="room-meta">
                        {room.metadata && (room.metadata.Occupancy || room.metadata.Occupant) && (
                          <span className="room-tag">
                            {room.metadata.Occupant || room.metadata.Occupancy}
                          </span>
                        )}
                        {room.metadata && room.metadata.Department && (
                          <span className="room-tag">{room.metadata.Department}</span>
                        )}
                      </div>
                    </div>
                    <div className="room-actions">
                      <button
                        className="room-action-button"
                        title={isHidden ? 'Show room' : 'Hide room'}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleToggleVisibility(room.id)
                        }}
                      >
                        {isHidden ? '👁' : '🙈'}
                      </button>
                      <button
                        className="room-action-button"
                        title="Focus camera on this room"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleSelectRoom(room.id)
                        }}
                      >
                        🎯
                      </button>
                      <div
                        className="room-color-preview"
                        style={{ backgroundColor: room.color }}
                      />
                      <input
                        type="color"
                        value={room.color}
                        onChange={(e) => handleColorChange(room.id, e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Change color for room ${display.name}`}
                      />
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

