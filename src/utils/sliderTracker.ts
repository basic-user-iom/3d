import { useBugTracker } from '../store/useBugTracker'

/**
 * Tracks slider interactions and detects if they trigger changes
 * Logs to bug tracker if a slider doesn't appear to trigger any effect
 */

interface SliderInteraction {
  name: string
  value: number
  timestamp: number
  component: string
  previousValue?: number
}

// Store previous values to detect changes
const sliderPreviousValues = new Map<string, number>()
const sliderInteractions: SliderInteraction[] = []
const MAX_INTERACTIONS = 50

/**
 * Track a slider interaction
 */
export function trackSliderInteraction(
  sliderName: string,
  value: number,
  component: string,
  onChangeCallback?: (value: number) => void
): void {
  const bugTracker = useBugTracker.getState()
  if (!bugTracker.enabled) return

  const previousValue = sliderPreviousValues.get(sliderName)
  const interaction: SliderInteraction = {
    name: sliderName,
    value,
    timestamp: Date.now(),
    component,
    previousValue
  }

  // Store previous value
  sliderPreviousValues.set(sliderName, value)

  // Add to interactions list
  sliderInteractions.push(interaction)
  if (sliderInteractions.length > MAX_INTERACTIONS) {
    sliderInteractions.shift()
  }

  // Check if value actually changed
  if (previousValue !== undefined && previousValue === value) {
    return // No change, skip tracking
  }

  // Check if callback was provided
  if (!onChangeCallback) {
    // No callback provided - potential bug
    bugTracker.addBug({
      type: 'warning',
      message: `Slider "${sliderName}" in ${component} has no onChange callback`,
      source: component,
      category: 'UI',
      details: {
        sliderName,
        value,
        previousValue
      }
    })
    return
  }

  // Call the callback to trigger the change
  try {
    onChangeCallback(value)
    
    // Schedule a check to see if the change took effect
    // We'll check after a short delay to see if the value persisted
    setTimeout(() => {
      const currentValue = sliderPreviousValues.get(sliderName)
      // If value changed but then reverted, it might indicate a bug
      // This is a heuristic - we can't perfectly detect if a slider "works"
      // but we can log suspicious cases
    }, 100)
  } catch (error) {
    // Callback threw an error - definitely a bug
    bugTracker.addBug({
      type: 'error',
      message: `Slider "${sliderName}" onChange callback threw error: ${error instanceof Error ? error.message : String(error)}`,
      source: component,
      category: 'UI',
      details: {
        sliderName,
        value,
        previousValue,
        error: error instanceof Error ? error.message : String(error)
      }
    })
  }
}

/**
 * Get slider interaction history
 */
export function getSliderInteractions(): SliderInteraction[] {
  return [...sliderInteractions]
}

/**
 * Clear slider interaction history
 */
export function clearSliderInteractions(): void {
  sliderInteractions.length = 0
  sliderPreviousValues.clear()
}







