import { useState, useRef, useEffect, KeyboardEvent, FocusEvent } from 'react'

interface NumberInputProps {
  value: number
  onChange: (value: number) => void
  step?: number
  min?: number
  max?: number
  decimals?: number
  [key: string]: any // Allow other props like className, style, etc.
}

/**
 * A number input component that properly handles keyboard editing
 * Allows backspace, delete, arrow keys, and other standard text editing
 */
export default function NumberInput({
  value,
  onChange,
  step = 0.1,
  min,
  max,
  decimals = 3,
  ...otherProps
}: NumberInputProps) {
  const [displayValue, setDisplayValue] = useState<string>(value.toFixed(decimals))
  const [isFocused, setIsFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Update display value when external value changes (but not while user is editing)
  useEffect(() => {
    if (!isFocused) {
      setDisplayValue(value.toFixed(decimals))
    }
  }, [value, decimals, isFocused])

  const handleFocus = (e: FocusEvent<HTMLInputElement>) => {
    setIsFocused(true)
    // Select all text on focus for easy editing
    e.target.select()
    // Update display to show full precision while editing
    setDisplayValue(value.toString())
    if (otherProps.onFocus) {
      otherProps.onFocus(e)
    }
  }

  const handleBlur = (e: FocusEvent<HTMLInputElement>) => {
    setIsFocused(false)
    
    // Parse and validate the input value
    let numValue = parseFloat(displayValue)
    
    // If empty or invalid, revert to current value
    if (isNaN(numValue)) {
      numValue = value
    }
    
    // Apply min/max constraints
    if (min !== undefined && numValue < min) {
      numValue = min
    }
    if (max !== undefined && numValue > max) {
      numValue = max
    }
    
    // Format the display value
    setDisplayValue(numValue.toFixed(decimals))
    
    // Only call onChange if value actually changed
    if (numValue !== value) {
      onChange(numValue)
    }
    
    if (otherProps.onBlur) {
      otherProps.onBlur(e)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setDisplayValue(newValue)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Allow: backspace, delete, tab, escape, enter, arrows, home, end
    // Allow: Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
    // Allow: numbers, decimal point, minus sign
    if (
      // Navigation keys
      ['Backspace', 'Delete', 'Tab', 'Escape', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key) ||
      // Modifier keys
      (e.key === 'a' && e.ctrlKey) ||
      (e.key === 'c' && e.ctrlKey) ||
      (e.key === 'v' && e.ctrlKey) ||
      (e.key === 'x' && e.ctrlKey) ||
      // Numbers and decimal
      /[\d.\-]/.test(e.key)
    ) {
      // Allow default behavior
      return
    }
    
    // Prevent other keys
    e.preventDefault()
  }

  const handleKeyUp = (e: KeyboardEvent<HTMLInputElement>) => {
    // Handle Enter key to commit and blur
    if (e.key === 'Enter') {
      inputRef.current?.blur()
    }
    
    // Handle Arrow Up/Down for increment/decrement
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      const currentValue = parseFloat(displayValue) || value
      const newValue = currentValue + step
      const constrainedValue = max !== undefined ? Math.min(newValue, max) : newValue
      if (min === undefined || constrainedValue >= min) {
        setDisplayValue(constrainedValue.toString())
        onChange(constrainedValue)
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      const currentValue = parseFloat(displayValue) || value
      const newValue = currentValue - step
      const constrainedValue = min !== undefined ? Math.max(newValue, min) : newValue
      if (max === undefined || constrainedValue <= max) {
        setDisplayValue(constrainedValue.toString())
        onChange(constrainedValue)
      }
    }
  }

  return (
    <input
      {...otherProps}
      ref={inputRef}
      type="text"
      inputMode="decimal"
      value={displayValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
    />
  )
}




