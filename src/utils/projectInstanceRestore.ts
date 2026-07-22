import type * as THREE from 'three'

/** Minimal saved-node shape used by DATA-1 hierarchy restore helpers. */
export interface SavedHierarchyNode {
  name: string
  position: { x: number; y: number; z: number }
  rotation: { x: number; y: number; z: number }
  scale: { x: number; y: number; z: number }
  visible: boolean
  children?: SavedHierarchyNode[]
}

/**
 * DATA-1: Multiple saved imported entries that share a fileName must each become
 * a distinct scene root. Reusing the first restored object by fileName collapses
 * instances and overwrites earlier transforms.
 */
export function shouldReuseImportedInstanceByFileName(): boolean {
  return false
}

/**
 * Deterministic hierarchy path from a root to a descendant.
 * Uses sibling index + name so identically named siblings stay distinct.
 */
export function getHierarchyPath(root: THREE.Object3D, target: THREE.Object3D): string | null {
  if (target === root) return ''

  const segments: string[] = []
  let current: THREE.Object3D | null = target

  while (current && current !== root) {
    const parent: THREE.Object3D | null = current.parent
    if (!parent) return null

    const index = parent.children.indexOf(current)
    if (index < 0) return null

    const name = current.name || 'Unnamed'
    segments.push(`${index}:${name}`)
    current = parent
  }

  if (current !== root) return null
  return segments.reverse().join('/')
}

/**
 * Resolve a child under `root` using a previously computed hierarchy path.
 */
export function findChildByHierarchyPath(
  root: THREE.Object3D,
  path: string
): THREE.Object3D | null {
  if (!path) return root

  let current: THREE.Object3D = root
  for (const segment of path.split('/')) {
    const colon = segment.indexOf(':')
    if (colon < 0) return null

    const index = Number.parseInt(segment.slice(0, colon), 10)
    const expectedName = segment.slice(colon + 1)
    if (!Number.isFinite(index) || index < 0 || index >= current.children.length) {
      return null
    }

    const child = current.children[index]
    const childName = child.name || 'Unnamed'
    if (childName !== expectedName) {
      // Name drift after loader updates — prefer exact name when available.
      const namedMatch = current.children.find(
        (candidate, candidateIndex) =>
          candidateIndex !== index && (candidate.name || 'Unnamed') === expectedName
      )
      if (namedMatch) {
        current = namedMatch
        continue
      }
    }
    current = child
  }

  return current
}

/**
 * Match a saved child onto a loaded hierarchy sibling list.
 * Prefer exact name, then index fallback for stable GLTF trees.
 */
export function matchSavedChildToLiveChild(
  liveChildren: readonly THREE.Object3D[],
  savedChild: Pick<SavedHierarchyNode, 'name'>,
  savedIndex: number,
  usedLiveIndexes: Set<number>
): THREE.Object3D | null {
  const wantedName = savedChild.name || 'Unnamed Object'

  for (let i = 0; i < liveChildren.length; i++) {
    if (usedLiveIndexes.has(i)) continue
    const liveName = liveChildren[i].name || 'Unnamed Object'
    if (liveName === wantedName) {
      usedLiveIndexes.add(i)
      return liveChildren[i]
    }
  }

  if (
    savedIndex >= 0 &&
    savedIndex < liveChildren.length &&
    !usedLiveIndexes.has(savedIndex)
  ) {
    usedLiveIndexes.add(savedIndex)
    return liveChildren[savedIndex]
  }

  return null
}

export function applySavedTransformToObject(
  obj: THREE.Object3D,
  saved: Pick<SavedHierarchyNode, 'position' | 'rotation' | 'scale' | 'visible' | 'name'>
): void {
  obj.position.set(saved.position.x, saved.position.y, saved.position.z)
  obj.rotation.set(saved.rotation.x, saved.rotation.y, saved.rotation.z)
  obj.scale.set(saved.scale.x, saved.scale.y, saved.scale.z)
  obj.visible = saved.visible
  if (saved.name) {
    obj.name = saved.name
  }
}

/**
 * Walk a saved hierarchy against an already-loaded asset tree and apply
 * transforms/visibility in place. Never appends placeholder Groups.
 */
export function applySavedHierarchyInPlace(
  liveRoot: THREE.Object3D,
  savedChildren: SavedHierarchyNode[] | undefined
): void {
  if (!savedChildren || savedChildren.length === 0) return

  const usedLiveIndexes = new Set<number>()

  for (let i = 0; i < savedChildren.length; i++) {
    const savedChild = savedChildren[i]
    const liveChild = matchSavedChildToLiveChild(
      liveRoot.children,
      savedChild,
      i,
      usedLiveIndexes
    )
    if (!liveChild) continue

    applySavedTransformToObject(liveChild, savedChild)
    applySavedHierarchyInPlace(liveChild, savedChild.children)
  }
}

/**
 * Ensure each scene occurrence has a stable instance id distinct from the asset fileName.
 */
export function ensureInstanceId(
  userData: Record<string, unknown>,
  fallbackId: string
): string {
  const existing = userData.instanceId
  if (typeof existing === 'string' && existing.trim() !== '') {
    return existing
  }
  userData.instanceId = fallbackId
  return fallbackId
}
