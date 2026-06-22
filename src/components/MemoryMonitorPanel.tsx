/**
 * Memory Monitor Panel
 * Displays current memory usage and warnings
 */

import React, { useEffect, useState } from 'react'
import { getMemoryMonitor, getMemoryInfo, type MemoryInfo, type MemoryWarning } from '../utils/memoryMonitor'

export default function MemoryMonitorPanel() {
  const [memory, setMemory] = useState<MemoryInfo | null>(null)
  const [warning, setWarning] = useState<MemoryWarning | null>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const monitor = getMemoryMonitor()
    
    // Get initial memory
    const initialMemory = getMemoryInfo()
    setMemory(initialMemory)
    const initialWarning = initialMemory ? (() => {
      const { usagePercent, usedMB, limitMB } = initialMemory
      if (usagePercent >= 90) {
        return { level: 'error' as const, message: `Critical: ${usagePercent.toFixed(1)}%`, usedMB, limitMB }
      } else if (usagePercent >= 75) {
        return { level: 'warning' as const, message: `Warning: ${usagePercent.toFixed(1)}%`, usedMB, limitMB }
      } else if (usagePercent >= 50) {
        return { level: 'info' as const, message: `${usagePercent.toFixed(1)}%`, usedMB, limitMB }
      }
      return null
    })() : null
    setWarning(initialWarning)

    // Subscribe to updates
    const unsubscribe = monitor.onWarning((info, warn) => {
      setMemory(info)
      setWarning(warn)
    })

    // Start monitoring
    monitor.start(2000) // Update every 2 seconds

    // Auto-show if memory is high
    if (initialMemory && initialMemory.usagePercent > 50) {
      setIsVisible(true)
    }

    return () => {
      unsubscribe()
      monitor.stop()
    }
  }, [])

  if (!memory) {
    return null // Memory API not available
  }

  const { usedMB, limitMB, usagePercent, availableMB } = memory

  // Determine color based on usage
  let color = '#4CAF50' // Green
  if (usagePercent >= 90) {
    color = '#F44336' // Red
  } else if (usagePercent >= 75) {
    color = '#FF9800' // Orange
  } else if (usagePercent >= 50) {
    color = '#FFC107' // Yellow
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        color: 'white',
        padding: '12px 16px',
        borderRadius: '8px',
        fontSize: '12px',
        fontFamily: 'monospace',
        zIndex: 10000,
        minWidth: '200px',
        cursor: 'pointer',
        border: `2px solid ${color}`,
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)'
      }}
      onClick={() => setIsVisible(!isVisible)}
      title="Click to toggle details"
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
        <div
          style={{
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            backgroundColor: color,
            animation: usagePercent >= 90 ? 'pulse 2s infinite' : 'none'
          }}
        />
        <strong>Memory: {usagePercent.toFixed(1)}%</strong>
      </div>

      {isVisible && (
        <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.2)' }}>
          <div>Used: {usedMB.toFixed(1)} MB</div>
          <div>Limit: {limitMB.toFixed(1)} MB</div>
          <div>Available: {availableMB.toFixed(1)} MB</div>
          
          {warning && (
            <div
              style={{
                marginTop: '8px',
                padding: '6px',
                backgroundColor: warning.level === 'error' ? 'rgba(244, 67, 54, 0.3)' :
                                 warning.level === 'warning' ? 'rgba(255, 152, 0, 0.3)' :
                                 'rgba(33, 150, 243, 0.3)',
                borderRadius: '4px',
                fontSize: '11px'
              }}
            >
              {warning.message}
            </div>
          )}

          {/* Progress bar */}
          <div
            style={{
              marginTop: '8px',
              height: '4px',
              backgroundColor: 'rgba(255, 255, 255, 0.2)',
              borderRadius: '2px',
              overflow: 'hidden'
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${Math.min(usagePercent, 100)}%`,
                backgroundColor: color,
                transition: 'width 0.3s ease'
              }}
            />
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  )
}








































