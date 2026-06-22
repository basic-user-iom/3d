# How to Start Streets GL Server

## Quick Start

1. Open a terminal/command prompt
2. Navigate to the streets-gl-alt directory:
   ```bash
   cd streets-gl-alt
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
4. Wait for the server to start (you'll see "webpack compiled successfully")
5. The server will be available at: http://localhost:8081

## Alternative: Use the Batch File

Double-click `start-dev.bat` in the `streets-gl-alt` folder.

## Verify Server is Running

- Open http://localhost:8081 in your browser
- You should see the Streets GL map interface
- The main 3D viewer should now be able to connect to it

## Troubleshooting

- **Port 8081 already in use**: Stop any other process using port 8081
- **npm run dev fails**: Make sure you've run `npm install` in the streets-gl-alt directory
- **Connection refused**: Make sure the server has fully started (wait for webpack compilation)







