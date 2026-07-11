# 360° Panorama Virtual Tour

A standalone 360° panorama viewer with virtual tour support. Upload multiple equirectangular panoramas, place interactive hotspots, and link scenes together.

## Features

- **Multiple Format Support**: KTX2 (FastHDR), HDR, EXR, JPG, PNG, WebP
- **Virtual Tour**: Upload multiple panoramas and navigate between them via link hotspots
- **Hotspots**: Place clickable points with three action types:
  - **Link** — navigate to another panorama in the tour
  - **Info** — show an info popup overlay
  - **URL** — open an external link in a new tab, or embedded in an iframe overlay
- **Interactive Controls**: Drag to rotate, scroll to zoom
- **Drag & Drop**: Drop image files onto the viewer area
- **Hotspot Editor**: Toggle edit mode and click the scene to place hotspots
- **Save / Load Project**: Export the full tour to a `.360project` file and restore it later

## How to Access

Open the app with the `?viewer=360` query parameter:

```
http://localhost:3000/?viewer=360
```

Load a specific image via URL parameter:

```
http://localhost:3000/?viewer=360&image=/path/to/panorama.jpg
```

## Usage

### 1. Add panoramas
- Click **Upload panorama** in the header or **+ Add** in the sidebar
- Or drag and drop an image onto the viewer area
- Supported: JPG, PNG, WebP, HDR, EXR, KTX2 (equirectangular 2:1 images work best)

### 2. Place hotspots
1. Select a panorama in the sidebar
2. Click **Edit hotspots** to enter edit mode
3. Click anywhere on the panorama to place a hotspot
4. Fill in the label, type, and target (panorama link, info text, or URL). For URL hotspots, optionally check **Open in iframe** to show the page in an embedded overlay instead of a new tab.
5. Click **Save hotspot**
6. Click **Done editing** when finished

### 3. Navigate the tour
- In view mode (not editing), click a **link** hotspot to jump to the linked panorama
- Click an **info** hotspot to read its popup
- Click a **url** hotspot to open the external link (new tab by default, or iframe overlay when enabled)

### 4. Manage panoramas
- Rename the active panorama using the name field in the sidebar
- Switch between panoramas by clicking them in the list
- Remove panoramas with the × button (requires at least one panorama to remain if others exist)

### 5. Save and load projects
- Click **Save project** in the header to download a `.360project` file (JSON) with all panoramas, hotspots, initial views, and the active scene
- Locally uploaded panorama files are embedded as base64 data URLs so the project is self-contained
- Remote URL panoramas are stored as URL references — reopening the project requires those URLs to still be reachable
- Click **Load project** to pick a saved `.360project` or `.json` file and restore the tour
- Loading replaces the current tour; you will be asked to confirm if you already have panoramas open

## Technical Details

- Uses Three.js with equirectangular texture on an inverted sphere
- OrbitControls for smooth 360° camera movement
- Hotspots stored as yaw/pitch spherical coordinates
- CSS-projected hotspot markers updated each frame
- No additional dependencies added

## File Locations

- `src/components/Panorama360Viewer.tsx` — Three.js panorama renderer + hotspot overlay
- `src/components/Panorama360TourPanel.tsx` — Sidebar for panoramas and hotspot management
- `src/panorama/panoramaTourTypes.ts` — Tour data types
- `src/panorama/panoramaProjectFile.ts` — Project save/load serialization
- `src/panorama/panoramaSphericalCoords.ts` — Spherical coordinate utilities
- `src/Panorama360App.tsx` — Virtual tour app wrapper
- `src/main.tsx` — Entry point (`?viewer=360` switch)
- `tests/panoramaSphericalCoords.test.ts` — Coordinate conversion tests

## Development

```bash
npm run dev:open
# Then open http://localhost:3000/?viewer=360
```

Run tests:

```bash
npm test -- tests/panoramaSphericalCoords.test.ts
```










































