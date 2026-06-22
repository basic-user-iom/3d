import { useEffect } from 'react'
import { useAppStore } from '../store/useAppStore'
import './Toast.css'

export default function Toast() {
  const { error, setError, loading, progress, loadingMessage } = useAppStore()

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError(null)
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [error, setError])

  if (!error && !loading) return null

  return (
    <div className="toast-container">
      {error && (
        <div className="toast error">
          <span className="toast-icon">❌</span>
          <span className="toast-message">{error}</span>
          <button className="toast-close" onClick={() => setError(null)}>
            ×
          </button>
        </div>
      )}
      {loading && (
        <div className="toast loading">
          <span className="toast-icon">⏳</span>
          <span className="toast-message">
            {loadingMessage || 'Loading model...'}
            {progress > 0 && ` ${progress.toFixed(1)}%`}
          </span>
          {progress > 0 && (
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

