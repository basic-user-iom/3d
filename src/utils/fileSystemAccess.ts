/**
 * File System Access API utilities
 * Allows users to choose a folder for saving files
 * Falls back to default download behavior if API is not available
 */

/**
 * Check if File System Access API is available
 */
export function isFileSystemAccessAvailable(): boolean {
  return 'showDirectoryPicker' in window && 'showSaveFilePicker' in window
}

/**
 * Save a file to a user-selected directory using File System Access API
 * Falls back to default download if API is not available
 */
export async function saveFileToDirectory(
  blob: Blob,
  filename: string,
  options?: {
    allowFolderSelection?: boolean // If true, shows folder picker; if false, shows file picker
    useFilePicker?: boolean // If true, always use file picker (user chooses filename/location)
  }
): Promise<void> {
  console.log('[FileSystemAccess] saveFileToDirectory called', { filename, blobSize: blob.size, options })
  const { allowFolderSelection = false, useFilePicker = false } = options || {}

  // Check if File System Access API is available
  const apiAvailable = isFileSystemAccessAvailable()
  console.log('[FileSystemAccess] File System Access API available:', apiAvailable)
  
  if (!apiAvailable) {
    // Fallback to default download behavior
    console.log('[FileSystemAccess] API not available, using default download')
    try {
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      console.log('[FileSystemAccess] ✅ File downloaded via default method')
    } catch (error) {
      console.error('[FileSystemAccess] ❌ Error in default download:', error)
      throw error
    }
    return
  }

  try {
    // Priority: useFilePicker > allowFolderSelection
    if (useFilePicker || !allowFolderSelection) {
      console.log('[FileSystemAccess] Showing file picker...')
      // Show file picker (allows user to choose location and filename)
      const fileHandle = await (window as any).showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: getFileDescription(filename),
            accept: {
              [getMimeType(filename)]: [getFileExtension(filename)]
            }
          }
        ]
      })
      console.log('[FileSystemAccess] File location selected')

      const writable = await fileHandle.createWritable()
      await writable.write(blob)
      await writable.close()

      console.log(`[FileSystemAccess] ✅ File saved: ${filename}`)
    } else {
      console.log('[FileSystemAccess] Showing folder picker...')
      // Show folder picker
      const directoryHandle = await (window as any).showDirectoryPicker({
        mode: 'readwrite'
      })
      console.log('[FileSystemAccess] Folder selected')

      // Create file in selected directory
      console.log('[FileSystemAccess] Creating file in selected folder...')
      const fileHandle = await directoryHandle.getFileHandle(filename, { create: true })
      const writable = await fileHandle.createWritable()
      await writable.write(blob)
      await writable.close()

      console.log(`[FileSystemAccess] ✅ File saved to selected folder: ${filename}`)
    }
  } catch (error: any) {
    console.error('[FileSystemAccess] Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    })
    
    // User cancelled the picker or error occurred
    if (error.name === 'AbortError' || error.name === 'NotAllowedError') {
      console.log('[FileSystemAccess] User cancelled file save')
      throw new Error('Save cancelled by user')
    }
    
    // Fallback to default download on error
    console.warn('[FileSystemAccess] Error using File System Access API, falling back to default download:', error)
    try {
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      console.log('[FileSystemAccess] ✅ File downloaded via fallback method')
    } catch (fallbackError) {
      console.error('[FileSystemAccess] ❌ Error in fallback download:', fallbackError)
      throw fallbackError
    }
  }
}

/**
 * Save multiple files to a user-selected directory
 */
export async function saveFilesToDirectory(
  files: Array<{ blob: Blob; filename: string }>,
  options?: {
    allowFolderSelection?: boolean
  }
): Promise<void> {
  const { allowFolderSelection = true } = options || {}

  // Check if File System Access API is available
  if (!isFileSystemAccessAvailable()) {
    // Fallback: download files sequentially
    console.log('[FileSystemAccess] API not available, downloading files sequentially')
    for (const file of files) {
      await saveFileToDirectory(file.blob, file.filename, { allowFolderSelection: false })
      // Small delay between downloads
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    return
  }

  try {
    if (allowFolderSelection) {
      // Show folder picker once, save all files to it
      const directoryHandle = await (window as any).showDirectoryPicker({
        mode: 'readwrite'
      })

      // Save all files to the selected directory
      for (const file of files) {
        const fileHandle = await directoryHandle.getFileHandle(file.filename, { create: true })
        const writable = await fileHandle.createWritable()
        await writable.write(file.blob)
        await writable.close()
        console.log(`[FileSystemAccess] Saved: ${file.filename}`)
      }

      console.log(`[FileSystemAccess] Saved ${files.length} file(s) to selected folder`)
    } else {
      // For file picker mode, we can only save one file at a time
      // So we'll use the first file and fall back to sequential downloads
      if (files.length === 1) {
        await saveFileToDirectory(files[0].blob, files[0].filename, { allowFolderSelection: false })
      } else {
        // Multiple files: use folder picker
        await saveFilesToDirectory(files, { allowFolderSelection: true })
      }
    }
  } catch (error: any) {
    // User cancelled or error occurred
    if (error.name === 'AbortError' || error.name === 'NotAllowedError') {
      console.log('[FileSystemAccess] User cancelled file save')
      throw new Error('Save cancelled by user')
    }
    
    // Fallback to sequential downloads
    console.warn('[FileSystemAccess] Error using File System Access API, falling back to sequential downloads:', error)
    for (const file of files) {
      await saveFileToDirectory(file.blob, file.filename, { allowFolderSelection: false })
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }
}

/**
 * Get MIME type from filename
 */
function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()
  const mimeTypes: Record<string, string> = {
    'json': 'application/json',
    'gz': 'application/gzip',
    'zip': 'application/zip',
    'html': 'text/html',
    'glb': 'model/gltf-binary',
    'gltf': 'model/gltf+json',
    'hdr': 'image/vnd.radiance',
    'exr': 'image/x-exr',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'webp': 'image/webp'
  }
  return mimeTypes[ext || ''] || 'application/octet-stream'
}

/**
 * Get file extension from filename
 */
function getFileExtension(filename: string): string {
  return filename.split('.').pop() || ''
}

/**
 * Get file description for file picker
 */
function getFileDescription(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()
  const descriptions: Record<string, string> = {
    'json': 'JSON Project File',
    'gz': 'Compressed Project File',
    'zip': 'ZIP Archive',
    'html': 'HTML File',
    'glb': 'GLB 3D Model',
    'gltf': 'GLTF 3D Model',
    'hdr': 'HDR Environment Map',
    'exr': 'EXR Environment Map'
  }
  return descriptions[ext || ''] || 'File'
}

