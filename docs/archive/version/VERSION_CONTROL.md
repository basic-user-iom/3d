# Version Control Guide

## Version 1.0

This is your stable version 1.0 release with all core features implemented:

### Features included in v1.0:
- ✅ Complete 3D model viewer (GLTF, FBX, OBJ, STL, PLY, 3MF, DAE formats)
- ✅ Twinmotion-style camera controls (Orbit, Pan, Zoom)
- ✅ Transform controls (Move, Rotate, Scale) with pivot centering
- ✅ Material Editor with PBR material support
- ✅ Lighting Panel with multiple directional lights and shadows
- ✅ HDR Environment maps support
- ✅ Camera Views system (save, load, export, import)
- ✅ Keyboard shortcuts for quick access
- ✅ Texture loading and management
- ✅ Shadow casting and visualization

## How to Go Back to Version 1.0

### Method 1: Using Git Tag (Recommended)
```bash
# View all tags
git tag -l

# Go back to version 1.0
git checkout v1.0

# If you want to continue working from v1.0, create a new branch
git checkout -b from-v1.0
```

### Method 2: Using Git Branch
```bash
# Switch to v1.0 stable branch
git checkout v1.0-stable
```

### Method 3: Reset Current Branch to v1.0
```bash
# WARNING: This will discard all changes after v1.0
git reset --hard v1.0
```

### Method 4: Create a New Branch from v1.0
```bash
# Create a new branch starting from v1.0
git checkout -b new-features v1.0
```

## Current Status

To see what branch/tag you're on:
```bash
git status
git branch
git tag -l
```

## Creating New Versions

When you're ready to create a new version:
```bash
# Commit your changes
git add -A
git commit -m "Description of changes"

# Create a new tag
git tag -a v1.1 -m "Version 1.1 - Description of new features"
```

## Backup Your Work

Always make sure your work is saved:
```bash
# Check status
git status

# Commit changes
git add -A
git commit -m "Your commit message"

# View commit history
git log --oneline
```

