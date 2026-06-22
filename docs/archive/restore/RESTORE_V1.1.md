# Restore to Version 1.1

This guide explains how to restore your project to version 1.1.

## Quick Restore (Windows)

Double-click `RESTORE_V1.1.bat` to automatically restore to version 1.1.

## Manual Restore

### Using Git Tag

```bash
git checkout v1.1
```

### Using Git Branch

```bash
git checkout v1.1-stable
```

## Return to Latest Version

To return to the latest development version:

```bash
git checkout master
```

## What's New in Version 1.1

- **UI Scaling Improvements**: Fixed TransformPanel positioning (now positioned from right, resizable)
- **Responsive Design**: Added comprehensive responsive scaling for all input fields and form elements
- **Texture Map Grid**: Improved texture map grid scaling with proper constraints
- **Icon Consistency**: All icons now maintain consistent 32px size
- **Mobile Support**: Added media queries for smaller screens (< 400px)
- **Input Overflow Fixes**: Fixed input overflow issues with min-width: 0 constraints
- **Panel Layout**: Updated viewer-container margins for proper panel layout
- **Content Padding**: Improved MaterialPanel and TransformPanel content padding
- **CSS Improvements**: Added proper box-sizing and width constraints throughout
- **Code Cleanup**: Fixed duplicate CSS rules and empty rulesets

## Version History

- **v1.0**: Initial stable version
- **v1.1**: UI Scaling and Responsive Design Improvements (current)

