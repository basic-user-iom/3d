import { useMemo, useRef } from 'react'
import { useAppStore, type TodoStatus } from '../store/useAppStore'
import { useFloatingPanel } from '../hooks/useFloatingPanel'
import { usePanelStacking } from '../hooks/usePanelStacking'
import './TodoPanel.css'

const STATUS_OPTIONS: Array<{ id: TodoStatus; label: string }> = [
  { id: 'pending', label: 'Pending' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'completed', label: 'Completed' }
]

const PANEL_WIDTH = 360

export default function TodoPanel() {
  const { showTodoPanel, toggleTodoPanel, todoItems, setTodoItemStatus } = useAppStore()
  const panelRef = useRef<HTMLElement | null>(null)
  const stackingOffset = usePanelStacking({ panelId: 'todo', anchor: 'right' })
  const { top: panelTop, left: panelLeft, maxHeight, dragging, handleMouseDown } = useFloatingPanel(
    panelRef as React.RefObject<HTMLElement>,
    {
      anchor: 'right',
      stackingOffset,
      panelWidth: PANEL_WIDTH,
      panelId: 'todo'
    }
  )

  const stats = useMemo(() => {
    const total = todoItems.length
    const completed = todoItems.filter((item) => item.status === 'completed').length
    const inProgress = todoItems.filter((item) => item.status === 'in_progress').length
    const pending = total - completed - inProgress
    return { total, completed, inProgress, pending }
  }, [todoItems])

  if (!showTodoPanel) {
    return null
  }

  return (
    <aside 
      ref={panelRef}
      className={`todo-panel ${dragging ? 'dragging' : ''}`}
      style={{
        top: `${panelTop}px`,
        left: `${panelLeft}px`,
        maxHeight: `${maxHeight}px`
      }}
    >
      <div className="todo-panel-header" onMouseDown={handleMouseDown}>
        <div>
          <h3>Feature TODOs</h3>
          <p>
            {stats.completed}/{stats.total} completed • {stats.inProgress} in progress • {stats.pending} pending
          </p>
        </div>
        <button className="todo-close-button" onClick={toggleTodoPanel} title="Close TODO panel">
          ×
        </button>
      </div>

      <div className="todo-panel-content">
        {todoItems.map((item) => (
          <div key={item.id} className={`todo-item todo-${item.status}`}>
            <div className="todo-item-title">{item.title}</div>
            <div className="todo-status-controls">
              {STATUS_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  className={`todo-status-button ${item.status === option.id ? 'active' : ''}`}
                  onClick={() => setTodoItemStatus(item.id, option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        ))}

        {todoItems.length === 0 && (
          <div className="todo-empty">No TODO items yet. Add tasks to track ongoing features.</div>
        )}
      </div>
    </aside>
  )
}





















