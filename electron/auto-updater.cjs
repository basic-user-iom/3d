const { app } = require('electron')

const APP_ID = 'com.3dviewer.app'

function setupAutoUpdater() {
  if (!app.isPackaged || process.env.DISABLE_AUTO_UPDATE === '1') {
    return
  }

  let autoUpdater
  try {
    ;({ autoUpdater } = require('electron-updater'))
  } catch {
    return
  }

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('error', (error) => {
    console.error('[AutoUpdater]', error instanceof Error ? error.message : String(error))
  })

  autoUpdater.on('update-available', (info) => {
    console.log('[AutoUpdater] Update available:', info.version)
    autoUpdater.downloadUpdate().catch((error) => {
      console.error(
        '[AutoUpdater] Download failed:',
        error instanceof Error ? error.message : String(error)
      )
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[AutoUpdater] Update downloaded:', info.version, '(installs on quit)')
  })

  autoUpdater.on('update-not-available', () => {
    console.log('[AutoUpdater] No update available')
  })

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((error) => {
      console.error(
        '[AutoUpdater] Check failed:',
        error instanceof Error ? error.message : String(error)
      )
    })
  }, 10000)
}

module.exports = { APP_ID, setupAutoUpdater }
