import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

/** Copy panorama static assets into the standalone demo (avoids shipping the full public/ tree). */
function copyPanoramaStaticAssets() {
  return {
    name: 'copy-panorama-static-assets',
    closeBundle() {
      const copies: Array<{ src: string; dest: string }> = [
        {
          src: path.resolve(__dirname, 'public/panoramas'),
          dest: path.resolve(__dirname, 'dist/panorama-360/panoramas')
        },
        {
          src: path.resolve(__dirname, 'public/panorama-effects'),
          dest: path.resolve(__dirname, 'dist/panorama-360/panorama-effects')
        },
        {
          src: path.resolve(__dirname, 'public/projects'),
          dest: path.resolve(__dirname, 'dist/panorama-360/projects')
        }
      ]
      for (const { src, dest } of copies) {
        if (!fs.existsSync(src)) continue
        fs.mkdirSync(dest, { recursive: true })
        fs.cpSync(src, dest, { recursive: true })
      }
    },
  }
}

/** Standalone build of the 360° panorama tour editor for iobjectm.com */
export default defineConfig({
  base: '/demos/panorama-360/',
  publicDir: false,
  build: {
    outDir: 'dist/panorama-360',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: path.resolve(__dirname, 'panorama-index.html'),
    },
  },
  plugins: [react(), copyPanoramaStaticAssets()],
  resolve: {
    alias: {
      '~': path.resolve(__dirname, './src'),
    },
  },
})
