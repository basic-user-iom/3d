# Restore to Version 1.2

This guide explains how to restore your project to version 1.2.

## Quick Restore (Windows)

Double-click `RESTORE_V1.2.bat` to automatically restore to version 1.2.

## Manual Restore

### Using Git Tag

```bash
git checkout v1.2
```

### Using Git Branch

```bash
git checkout v1.2-stable
```

## Return to Latest Version

To return to the latest development version:

```bash
git checkout master
```

## What's New in Version 1.2

- **SBAR/SBSAR Extraction Support**: Automatic extraction of embedded images from Substance archives (ZIP-based archives only)
- **Shadow Improvements**: Dynamic shadow camera bounds for better shadow quality at any distance
- **Rendering Quality Options**: Added controls for pixel ratio, max pixel ratio, texture anisotropy, logarithmic depth buffer, and GPU preference
- **Centralized Texture Loader**: Unified texture loading system supporting all formats (standard, HDR/EXR, KTX2/Basis, SBAR/SBSAR extraction)
- **Better Error Handling**: Graceful handling of SBAR/SBSAR files with helpful error messages
- **UI Improvements**: Fixed scaling issues in MaterialPanel, LightingPanel, TransformPanel, and CameraViewsPanel
- **Camera Views**: Enhanced camera views with static/video types and export capabilities
- **Documentation**: Updated README with SBAR/SBSAR support information

## Version History

- **v1.0**: Initial stable version
- **v1.1**: UI Scaling and Responsive Design Improvements
- **v1.2**: SBAR/SBSAR Extraction Support, Shadow Improvements, and Rendering Quality Options (current)

