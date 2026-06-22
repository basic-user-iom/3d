# Streets GL Integration Guide

This guide documents how the viewer communicates with the managed Streets GL
instance, how to run both sides locally, and where to look when debugging
synchronization issues.

## Why Streets GL?

The viewer embeds a Streets GL iframe that renders city-scale context (terrain,
streets, weather systems). The React app drives that iframe via a custom bridge.

## Dev Servers

| Script | What it does |
| ------ | ------------ |
| `npm run streets-gl:managed` | Boots the Streets GL server via `scripts/start-streets-gl-server.js`. Used by `npm run dev`. |
| `npm run streets-gl` | Runs Streets GL from the `streets-gl-alt` directory (for direct, manual work). |
| `npm run dev` | Launches the managed Streets GL server + Vite viewer (`concurrently -n "StreetsGL,3DViewer"`). |
| `npm run dev:full` | Starts bug server, managed Streets GL, and viewer simultaneously. |

> The viewer assumes the Streets GL iframe is reachable at the host/port
> provided by `start-streets-gl-server.js`. If you change ports, update both the
> server script and the bridge code accordingly.

## Bridge Overview

`src/utils/streetsGLBridge.ts` encapsulates the messaging layer:

- Sets up `postMessage` handlers and waits for `STREETS_GL_BRIDGE_READY`.
- Queues objects while the iframe is still initializing.
- Sends/receives object add/update/remove events, camera sync, etc.
- Hooks into `useAppStore` for app-wide selection state and object lists.

## Typical Workflow

1. Run `npm run dev` (or `dev:full` if you need the bug server).
2. The viewer boots on port 3000; Streets GL boots in the background (see the
   console output for its port if you need to inspect it directly).
3. Load a model in the viewer. It sends object metadata to the Streets GL iframe
   so the city scene reflects the same placements.
4. Manipulating objects in the viewer (translate/rotate/scale) results in
   bridge messages so the iframe stays in sync.

## Debugging Tips

- **Bridge never becomes ready**: confirm the iframe URL is correct and the
  Streets GL server is running. Check browser devtools to see if
  `STREETS_GL_BRIDGE_READY` ever fires.
- **Objects missing in Streets GL**: inspect the `pendingObjects` map in the
  bridge to ensure they were queued before the bridge became ready. Verify the
  iframe console for errors.
- **Ports collide**: if another service already uses the Streets GL port,
  update `scripts/start-streets-gl-server.js` and any hard-coded URLs in the
  bridge.
- **Manual Streets GL development**: run `npm run streets-gl` from the
  `streets-gl-alt` directory in a separate terminal. You can then point the
  viewer at that port for debugging deeper engine changes.

## Related Files

- `scripts/start-streets-gl-server.js` – spawns or proxies the iframe backend.
- `scripts/ensure-streets-gl-running.js` – helper invoked during dev scripts.
- `src/utils/streetsGLBridge.ts` – core client/iframe bridge logic.
- `src/store/useAppStore.ts` – app state slices that store Streets GL data.


