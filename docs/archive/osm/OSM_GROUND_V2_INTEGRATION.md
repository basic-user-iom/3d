# OSM GROUND ver2 Integration - Complete

## Summary

Successfully integrated Streets GL Alternative Installation into the main 3D model viewer with a new "OSM GROUND ver2" button.

## What Was Done

### 1. State Management (`src/store/useAppStore.ts`)
- Added `showOSMGroundV2Panel: boolean` state
- Added `toggleOSMGroundV2Panel: () => void` function
- Initialized state to `false` by default

### 2. New Component (`src/components/OSMGroundV2Panel.tsx`)
- Created a new panel component that:
  - Checks if the Streets GL server (port 8081) is running
  - Displays server status (online/offline/checking)
  - Provides two view options:
    - **View in Panel**: Embeds Streets GL in an iframe within the panel
    - **Open in New Window**: Opens Streets GL in a separate browser window
  - Shows features list and server URL
  - Provides helpful error messages if server is offline

### 3. Styling (`src/components/OSMGroundV2Panel.css`)
- Created comprehensive CSS styling for the panel
- Includes styles for:
  - Panel layout and positioning
  - Server status indicators
  - Button groups and interactions
  - Iframe container
  - Error messages and code blocks

### 4. Menu Configuration (`src/config/toolbarMenu.ts`)
- Added `toggleOSMGroundV2Panel` to `MenuActionId` type
- Added `toggleOSMGroundV2Panel` to the `modeling` section in `DEFAULT_MENU_LAYOUT`

### 5. Toolbar Integration (`src/components/Toolbar.tsx`)
- Added button label: `'OSM GROUND ver2'`
- Added button with emoji: 🗺️
- Added tooltip: "Streets GL Alternative - Full-featured 3D OpenStreetMap renderer"
- Integrated toggle functionality

### 6. App Integration (`src/App.tsx`)
- Imported `OSMGroundV2Panel` component
- Added `showOSMGroundV2Panel` to state destructuring
- Added conditional rendering: `{showOSMGroundV2Panel && <OSMGroundV2Panel />}`

## How to Use

### Starting the Streets GL Server

Before using the "OSM GROUND ver2" button, you need to start the Streets GL server:

```bash
cd streets-gl-alt
npm run dev
```

The server will start on `http://localhost:8081`

### Using the Feature

1. **Click the "OSM GROUND ver2" button** in the toolbar (under Modeling section)
2. **Panel opens** showing:
   - Server status (checks automatically every 5 seconds)
   - View options (Panel or New Window)
   - Features list
   - Server URL

3. **Choose view mode**:
   - **View in Panel**: Streets GL renders in an iframe within the panel
   - **Open in New Window**: Opens Streets GL in a separate browser window

### Server Status

- ✅ **Online**: Server is running and accessible
- ❌ **Offline**: Server is not running (shows instructions to start it)
- ⏳ **Checking**: Currently checking server status

## Features of Streets GL

The integrated Streets GL Alternative includes:
- Real-time 3D map rendering
- Configurable time of day
- Global map search
- Real-time air traffic
- Terrain with LODs
- Deferred shading with PBR
- Rich postprocessing effects (TAA, SSAO, depth of field, screen-space reflections, bloom)
- Realistic atmosphere and aerial perspective rendering

## File Locations

- **Component**: `src/components/OSMGroundV2Panel.tsx`
- **Styles**: `src/components/OSMGroundV2Panel.css`
- **Streets GL Installation**: `streets-gl-alt/`
- **Server URL**: `http://localhost:8081`

## Notes

- The panel automatically checks server status every 5 seconds
- If the server is offline, helpful instructions are displayed
- The iframe view allows you to interact with Streets GL directly within the 3D viewer
- The new window option provides a full-screen experience
- The panel is draggable and resizable (using the floating panel hook)

## Troubleshooting

### Server Not Starting
- Make sure you're in the `streets-gl-alt` directory
- Run `npm install` if dependencies are missing
- Check that port 8081 is not already in use
- Check the terminal for error messages

### Panel Not Showing Streets GL
- Verify the server is running: open `http://localhost:8081` in your browser
- Check browser console for CORS or iframe errors
- Try the "Open in New Window" option instead

### Button Not Appearing
- Check that the button is enabled in the toolbar menu layout
- The button should be in the "Modeling" section
- You can customize the menu layout by dragging buttons







