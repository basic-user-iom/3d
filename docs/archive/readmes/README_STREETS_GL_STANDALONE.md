# Streets GL Standalone

A standalone implementation of a 3D map renderer inspired by [streets.gl](https://github.com/StrandedKitty/streets-gl), built with Three.js and OpenStreetMap data.

## Features

- **3D Map Rendering**: Displays OpenStreetMap tiles as a 3D ground layer
- **3D Buildings**: Renders buildings from OSM Buildings data with proper heights
- **Location Search**: Search for locations using Nominatim (OpenStreetMap geocoding)
- **Multiple Map Styles**: Switch between OpenStreetMap, CartoDB Light/Dark, and Satellite imagery
- **Time of Day Control**: Adjust sun position and intensity for different times of day
- **Interactive Camera**: Orbit controls for exploring the 3D map
- **URL Hash Navigation**: Share locations using URL hash format (compatible with streets.gl)
- **Shadows**: Real-time shadow rendering with configurable settings

## Usage

### Opening the Standalone File

Simply open `streets-gl-standalone.html` in a modern web browser. The file is completely self-contained and uses CDN-hosted Three.js libraries, so no build process is required.

### URL Hash Format

The application supports URL hash navigation in the format:
```
#lat,lon,zoom,heading,pitch
```

Example:
```
#32.89821,-97.03640,15,0.00,45.00
```

This matches the format used by streets.gl, so you can use the same URLs.

### Controls

**Search Panel (Top Left)**
- Search for locations by name
- Click on search results to navigate to that location

**Controls Panel (Top Right)**
- **Map Style**: Choose between different map tile providers
- **Time of Day**: Adjust the sun position (0-24 hours)
- **Sun Intensity**: Control the brightness of the sun
- **Show Buildings**: Toggle 3D building rendering
- **Shadows**: Enable/disable shadow rendering
- **Zoom Level**: Adjust the map zoom level (10-18)
- **Latitude/Longitude**: Manually set coordinates
- **Update Location**: Reload the map at the specified location

**Info Panel (Bottom Left)**
- Displays current coordinates, zoom level, and building count

### Camera Controls

- **Left Click + Drag**: Rotate camera around the map
- **Right Click + Drag**: Pan the camera
- **Scroll Wheel**: Zoom in/out
- **Middle Click + Drag**: Pan the camera

## Technical Details

### Map Tiles

The application loads map tiles from various providers:
- **OpenStreetMap**: Standard OSM tiles
- **CartoDB**: Light and dark themed tiles
- **Satellite**: ESRI World Imagery tiles

### Building Data

Buildings are fetched from the OSM Buildings tile service:
- Uses the Simple 3D Buildings schema
- Extracts building heights from `height` or `building:levels` properties
- Default height is 6 meters (2 levels × 3 meters per level)

### Performance

- Map tiles are loaded in a 3×3 grid around the center location
- Buildings are loaded for the same area
- Higher zoom levels show more detail but require more data

## Browser Compatibility

Requires a modern browser with:
- WebGL 2.0 support
- ES6 modules support
- Fetch API support

Tested on:
- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)

## Limitations

This is a simplified standalone implementation. Compared to the full streets.gl project:

- No terrain elevation (flat ground only)
- No post-processing effects (TAA, SSAO, etc.)
- No air traffic visualization
- Simplified building rendering
- No deferred shading pipeline
- Basic shadow implementation

## Credits

- Inspired by [streets.gl](https://github.com/StrandedKitty/streets-gl) by StrandedKitty
- Uses [Three.js](https://threejs.org/) for 3D rendering
- Map tiles from OpenStreetMap and various providers
- Building data from OSM Buildings
- Geocoding via Nominatim

## License

This standalone implementation is provided as-is for educational and demonstration purposes.







