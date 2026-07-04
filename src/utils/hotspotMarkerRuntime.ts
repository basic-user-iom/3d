/**
 * Shared hotspot marker constants and web-export runtime snippet.
 * Editor uses hotspotUtils.createHotspotMarker; export embeds generateHotspotMarkerRuntimeJs().
 */

/** ~36px screen size at 50° FOV when sizeAttenuation is false */
export const HOTSPOT_MARKER_SCALE = 0.05
export const HOTSPOT_MARKER_SIZE_ATTENUATION = false
export const HOTSPOT_HELPER_SPHERE_RADIUS = 0.3
export const HOTSPOT_ICON_TEXTURE_SIZE = 256

/**
 * JavaScript source embedded in web export HTML.
 * Must be self-contained (uses THREE + document only).
 */
export function generateHotspotMarkerRuntimeJs(): string {
  return `
    const HOTSPOT_MARKER_SCALE = ${HOTSPOT_MARKER_SCALE};
    const HOTSPOT_MARKER_SIZE_ATTENUATION = ${HOTSPOT_MARKER_SIZE_ATTENUATION};
    const HOTSPOT_HELPER_SPHERE_RADIUS = ${HOTSPOT_HELPER_SPHERE_RADIUS};
    const HOTSPOT_ICON_TEXTURE_SIZE = ${HOTSPOT_ICON_TEXTURE_SIZE};

    function resolveHotspotIconForMarker(hotspot, showIcon) {
      if (!showIcon || !hotspot.icon) return null;
      if (hotspot.icon.type === 'symbol') {
        return { type: 'default', value: hotspot.icon.value };
      }
      if (hotspot.icon.type === 'custom-image') {
        return { type: 'custom-image', value: hotspot.icon.value };
      }
      if (hotspot.icon.type === 'default' || hotspot.icon.type === 'emoji' || hotspot.icon.type === 'custom') {
        return { type: hotspot.icon.type, value: hotspot.icon.value };
      }
      return null;
    }

    function createDefaultHotspotIconTexture() {
      const size = HOTSPOT_ICON_TEXTURE_SIZE;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, size, size);

      const cx = size / 2;
      const cy = size / 2;
      const radius = size * 0.35;

      ctx.save();
      ctx.translate(cx, cy + size * 0.02);
      const shadowRadius = radius * 1.2;
      const shadowGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, shadowRadius);
      shadowGradient.addColorStop(0, 'rgba(0, 0, 0, 0.2)');
      shadowGradient.addColorStop(0.5, 'rgba(0, 0, 0, 0.1)');
      shadowGradient.addColorStop(0.8, 'rgba(0, 0, 0, 0.05)');
      shadowGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = shadowGradient;
      ctx.beginPath();
      ctx.arc(0, 0, shadowRadius, 0, Math.PI * 2, false);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.translate(cx, cy);

      const glowGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 1.3);
      glowGradient.addColorStop(0, 'rgba(74, 158, 255, 0.2)');
      glowGradient.addColorStop(0.6, 'rgba(74, 158, 255, 0.1)');
      glowGradient.addColorStop(1, 'rgba(74, 158, 255, 0)');
      ctx.fillStyle = glowGradient;
      ctx.beginPath();
      ctx.arc(0, 0, radius * 1.3, 0, Math.PI * 2);
      ctx.fill();

      const circleGradient = ctx.createRadialGradient(-radius * 0.3, -radius * 0.3, 0, 0, 0, radius);
      circleGradient.addColorStop(0, '#4a9eff');
      circleGradient.addColorStop(0.5, '#3d8bf0');
      circleGradient.addColorStop(1, '#2d6cd9');
      ctx.fillStyle = circleGradient;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();

      const borderGradient = ctx.createLinearGradient(-radius, -radius, radius, radius);
      borderGradient.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
      borderGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.1)');
      borderGradient.addColorStop(1, 'rgba(200, 220, 255, 0.2)');
      ctx.strokeStyle = borderGradient;
      ctx.lineWidth = size * 0.015;
      ctx.stroke();

      const highlightGradient = ctx.createRadialGradient(-radius * 0.4, -radius * 0.4, 0, -radius * 0.2, -radius * 0.2, radius * 0.5);
      highlightGradient.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
      highlightGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.15)');
      highlightGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = highlightGradient;
      ctx.beginPath();
      ctx.arc(-radius * 0.2, -radius * 0.2, radius * 0.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.generateMipmaps = true;
      texture.needsUpdate = true;
      return texture;
    }

    function createEmojiHotspotIconTexture(emoji) {
      const size = HOTSPOT_ICON_TEXTURE_SIZE;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, size, size);

      ctx.save();
      ctx.translate(size / 2, size / 2);
      ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
      ctx.shadowBlur = size * 0.1;
      ctx.shadowOffsetY = size * 0.03;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.beginPath();
      ctx.arc(0, size * 0.02, size * 0.38, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.translate(size / 2, size / 2);
      const gradient = ctx.createRadialGradient(-size * 0.2, -size * 0.2, 0, 0, 0, size * 0.4);
      gradient.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
      gradient.addColorStop(0.5, 'rgba(245, 245, 250, 0.9)');
      gradient.addColorStop(1, 'rgba(235, 235, 245, 0.85)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.38, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(180, 180, 200, 0.3)';
      ctx.lineWidth = size * 0.025;
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.translate(size / 2, size / 2);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold ' + (size * 0.5) + 'px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
      ctx.fillText(emoji, 0, 0);
      ctx.restore();

      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.generateMipmaps = true;
      texture.needsUpdate = true;
      return texture;
    }

    function createHotspotIconTextureForExport(iconForMarker) {
      if (!iconForMarker) return createDefaultHotspotIconTexture();
      if (iconForMarker.type === 'emoji') return createEmojiHotspotIconTexture(iconForMarker.value);
      if (iconForMarker.type === 'custom-image') return createDefaultHotspotIconTexture();
      return createDefaultHotspotIconTexture();
    }

    function createHotspotMarkerGroup(hotspot, position, showIcon) {
      const iconForMarker = resolveHotspotIconForMarker(hotspot, showIcon);
      const texture = showIcon ? createHotspotIconTextureForExport(iconForMarker) : createDefaultHotspotIconTexture();

      const spriteMaterial = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: true,
        depthWrite: false,
        sizeAttenuation: HOTSPOT_MARKER_SIZE_ATTENUATION,
        opacity: 1.0
      });

      const sprite = new THREE.Sprite(spriteMaterial);
      sprite.position.set(0, 0, 0);
      sprite.scale.setScalar(HOTSPOT_MARKER_SCALE);
      sprite.renderOrder = 1000;
      sprite.userData.isHotspot = true;
      sprite.userData.isHotspotMarker = true;
      sprite.userData.hotspotId = hotspot.id;
      sprite.userData.hotspotName = hotspot.name;
      sprite.userData.baseScale = HOTSPOT_MARKER_SCALE;
      sprite.visible = showIcon;

      const helperGeometry = new THREE.SphereGeometry(HOTSPOT_HELPER_SPHERE_RADIUS, 16, 16);
      const helperMaterial = new THREE.MeshBasicMaterial({ visible: false, transparent: true, opacity: 0 });
      const helperSphere = new THREE.Mesh(helperGeometry, helperMaterial);
      helperSphere.position.set(0, 0, 0);
      helperSphere.renderOrder = 999;
      helperSphere.userData.isHotspot = true;
      helperSphere.userData.hotspotId = hotspot.id;
      helperSphere.userData.hotspotName = hotspot.name;
      helperSphere.userData.isHotspotHelper = true;
      helperSphere.userData.associatedSprite = sprite;
      sprite.userData.helperSphere = helperSphere;

      const group = new THREE.Group();
      group.add(sprite);
      group.add(helperSphere);
      group.position.copy(position);
      group.userData.isHotspot = true;
      group.userData.hotspotId = hotspot.id;
      group.userData.hotspotName = hotspot.name;
      group.userData.baseScale = HOTSPOT_MARKER_SCALE;
      group.userData.hotspotSprite = sprite;
      group.userData.hotspotHelper = helperSphere;
      return group;
    }
  `
}
