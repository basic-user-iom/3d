# Quick Guide: Restore to Version 1.0

## Method 1: View Only (Safe)
```bash
git checkout v1.0
```
This switches to v1.0 for viewing. To go back: `git checkout master`

## Method 2: Create New Branch from v1.0
```bash
git checkout -b restore-v1.0 v1.0
```
This creates a new branch starting from v1.0. Safe - doesn't affect master.

## Method 3: Reset Current Branch (Destructive)
```bash
# WARNING: This will delete all changes after v1.0!
git reset --hard v1.0
```

## Method 4: Use the Batch File
Double-click `RESTORE_V1.0.bat` in Windows Explorer

## Check Your Current Version
```bash
git status
git log --oneline -5
```

## Current Setup
- **Tag**: `v1.0` - Your stable version 1.0
- **Branch**: `v1.0-stable` - Branch pointing to v1.0
- **Branch**: `master` - Your main development branch

