# Shadow System Test Panel Integration

## Overview

Created a comprehensive test panel for the main application that compares shadow behavior with the test demo (`test-shadow-system.html`).

## Files Created

### 1. `src/utils/shadowSystemTests.ts`
- **Purpose**: Test utilities for shadow system
- **Functions**:
  - `runShadowSystemTests()`: Runs comprehensive shadow tests
  - `formatTestResults()`: Formats test results as string
  - `compareWithTestDemo()`: Compares results with test demo expectations
- **Tests**:
  - Renderer shadow map enabled/type
  - Directional lights configuration
  - Shadow map size
  - Shadow camera bounds (tight like test demo)
  - Shadow camera near/far planes
  - Shadow radius
  - Objects casting/receiving shadows
  - Shadow plane configuration

### 2. `src/components/ShadowSystemTestPanel.tsx`
- **Purpose**: React component for shadow system tests
- **Features**:
  - Auto-runs tests when viewer is ready
  - Shows test results with pass/fail indicators
  - Compares with test demo expectations
  - Copy results to clipboard
  - Floating panel with drag support

### 3. `src/components/ShadowSystemTestPanel.css`
- **Purpose**: Styling for test panel
- **Features**: Matches other panels' styling

## Integration

### Store (`src/store/useAppStore.ts`)
- Added `showShadowSystemTestPanel: boolean`
- Added `toggleShadowSystemTestPanel: () => void`

### Toolbar (`src/components/Toolbar.tsx`)
- Added button: "🧪 Shadow Tests"
- Added to "Rendering" section
- Button toggles test panel

### App (`src/App.tsx`)
- Imported `ShadowSystemTestPanel`
- Renders panel when `showShadowSystemTestPanel` is true

### Menu Config (`src/config/toolbarMenu.ts`)
- Added `toggleShadowSystemTestPanel` to `MenuActionId`
- Added to "rendering" section in `DEFAULT_MENU_LAYOUT`

## How to Use

1. **Open Test Panel**: Click "🧪 Shadow Tests" button in Rendering section
2. **Tests Auto-Run**: Tests run automatically when viewer is ready
3. **View Results**: See pass/fail status for each test
4. **Compare with Demo**: See if main app matches test demo behavior
5. **Copy Results**: Click "Copy Results" to copy test results to clipboard
6. **Re-run Tests**: Click "Run Tests" to run tests again

## Test Coverage

### Renderer Tests
- ✅ Shadow map enabled
- ✅ Shadow map type (PCFShadowMap)

### Light Tests
- ✅ Directional lights exist
- ✅ Shadow map size (>= 2048px)
- ✅ Shadow radius (1-3)

### Shadow Camera Tests
- ✅ Shadow camera bounds (tight: -50 to 50, like test demo: -10 to 10)
- ✅ Shadow camera near plane (<= 0.1, like test demo)
- ✅ Shadow camera far plane (<= 100, test demo uses 50)

### Object Tests
- ✅ Objects cast shadows
- ✅ Objects receive shadows

### Shadow Plane Tests
- ✅ Shadow plane exists
- ✅ Shadow plane receives shadows
- ✅ Shadow plane does not cast shadows
- ✅ Shadow plane is visible

## Comparison with Test Demo

The test panel automatically compares results with test demo expectations:
- ✅ **Matches**: All tests pass and behavior matches test demo
- ❌ **Does not match**: Shows specific differences

## Expected Differences (After Fixes)

After applying the fixes:
- ✅ Shadow camera bounds: Should be tight (-10 to 10 initially, like test demo)
- ✅ Shadow camera near/far: Should match test demo (0.1/50)
- ✅ Shadow radius: Should be 2 (smoother than test demo's default)
- ✅ Shadow map size: Should be 8192px (4x better than test demo's 2048px)

## Next Steps

1. Run the test panel in the main app
2. Check for any failing tests
3. Compare with test demo behavior
4. Fix any differences found
5. Verify shadows work correctly





