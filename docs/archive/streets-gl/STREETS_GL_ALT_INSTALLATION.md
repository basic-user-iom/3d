# Streets GL Alternative Installation - Complete

## Installation Summary

A unique alternative installation of Streets GL has been successfully set up in the `streets-gl-alt` directory.

## What Was Done

1. **Copied Files**: All files from `files-upload/for-maps-osm/streets-gl-dev` were copied to `streets-gl-alt`

2. **Unique Configuration**:
   - Package name: `streets-gl-alt` (instead of `streets-gl`)
   - Version: `2.0.0-alt`
   - Port: `8081` (instead of default 8080)
   - Description: "OpenStreetMap 3D renderer - Alternative Installation"

3. **Dependencies Installed**: All npm packages have been installed successfully

4. **Configuration Updates**:
   - `package.json`: Updated with unique name and port
   - `webpack.config.js`: Configured to run on port 8081 with auto-open browser
   - Fixed git commit SHA handling for non-git environments

5. **Startup Scripts Created**:
   - `start-dev.bat`: Windows batch file to start the dev server
   - `README-ALT.md`: Documentation for this installation

## How to Use

### Start Development Server

**Option 1: Using npm**
```bash
cd streets-gl-alt
npm run dev
```

**Option 2: Using batch file**
```bash
cd streets-gl-alt
start-dev.bat
```

### Access the Application

Once the server starts, it will automatically open in your browser at:
**http://localhost:8081**

If it doesn't open automatically, navigate to that URL manually.

## Location

- **Directory**: `D:\ai-cursor\3d-test-software\streets-gl-alt\`
- **Port**: 8081
- **Status**: Ready to use

## Notes

- This installation is completely independent from any other Streets GL installations
- The port 8081 was chosen to avoid conflicts with other services
- All dependencies are installed and ready
- The dev server is configured to automatically open the browser

## Next Steps

The server should now be running. If you need to:
- **Stop the server**: Press `Ctrl+C` in the terminal
- **Restart**: Run `npm run dev` again
- **Build for production**: Run `npm run build`

## Troubleshooting

If the server doesn't start:
1. Make sure port 8081 is not already in use
2. Check that all dependencies are installed: `npm install`
3. Check the terminal output for any error messages







