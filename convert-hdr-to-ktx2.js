// Quick script to convert HDR to KTX2 and load in viewer
// This will be run in the browser console

import { convertHDRToFastHDR } from './src/utils/hdrToFastHDR.js';

async function convertAndLoad() {
  try {
    // Load the HDR file
    const response = await fetch('/empty_warehouse_01_8k.hdr');
    const blob = await response.blob();
    const file = new File([blob], 'empty_warehouse_01_8k.hdr', { type: 'image/vnd.radiance' });
    
    console.log('Converting HDR to KTX2...');
    
    // Convert to KTX2
    const result = await convertHDRToFastHDR(file, {
      maxResolution: 4096, // 4K for faster conversion
      quality: 4,
      onProgress: (progress) => {
        console.log(`Conversion progress: ${progress.toFixed(0)}%`);
      }
    });
    
    console.log('Conversion complete!', {
      originalSize: result.originalSize,
      convertedSize: result.convertedSize,
      compressionRatio: result.compressionRatio
    });
    
    // Create a URL for the converted file
    const ktx2Url = URL.createObjectURL(result.ktx2Blob);
    console.log('KTX2 file created, URL:', ktx2Url);
    
    // Load in viewer by navigating to it
    window.location.href = `/?viewer=360&image=${encodeURIComponent(ktx2Url)}`;
    
    return result;
  } catch (error) {
    console.error('Conversion failed:', error);
    throw error;
  }
}

convertAndLoad();









































