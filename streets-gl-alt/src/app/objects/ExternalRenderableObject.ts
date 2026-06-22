/**
 * External Renderable Object
 * A renderable object that can be added to Streets GL scene from external sources
 * Extends RenderableObject3D to support mesh rendering
 */

import RenderableObject3D from './RenderableObject3D'
import AbstractMesh from '~/lib/renderer/abstract-renderer/AbstractMesh'
import AbstractRenderer from '~/lib/renderer/abstract-renderer/AbstractRenderer'
import AbstractTexture2D from '~/lib/renderer/abstract-renderer/AbstractTexture2D'
import { RendererTypes } from '~/lib/renderer/RendererTypes'
import Vec3 from '~/lib/math/Vec3'

export interface GeometryData {
	positions: Float32Array // [x, y, z, x, y, z, ...]
	indices?: Uint32Array // [i1, i2, i3, i1, i2, i3, ...]
	normals?: Float32Array // [nx, ny, nz, nx, ny, nz, ...]
	uvs?: Float32Array // [u, v, u, v, ...]
}

export default class ExternalRenderableObject extends RenderableObject3D {
	public mesh: AbstractMesh = null
	private geometryData: GeometryData | null = null
	private renderer: AbstractRenderer | null = null
	public color: { r: number; g: number; b: number } = { r: 1.0, g: 1.0, b: 1.0 } // Default white
	public baseColorTexture: AbstractTexture2D | null = null
	public useBaseColorMap = false

	constructor(geometryData: GeometryData, color?: { r: number; g: number; b: number }) {
		super()
		this.geometryData = geometryData
		if (color) {
			this.color = color
		}
	}

	public isMeshReady(): boolean {
		return this.mesh !== null
	}

	public updateMesh(renderer: AbstractRenderer): void {
		if (!this.geometryData) {
			console.warn('[ExternalRenderableObject] No geometry data to create mesh')
			return
		}

		if (this.mesh !== null) {
			// Mesh already created, skip
			return
		}

		this.renderer = renderer

		try {
			const attributes: any[] = []

			// Position attribute (required)
			if (this.geometryData.positions && this.geometryData.positions.length > 0) {
				attributes.push(
					renderer.createAttribute({
						name: 'position',
						type: RendererTypes.AttributeType.Float32,
						format: RendererTypes.AttributeFormat.Float,
						size: 3, // x, y, z
						normalized: false,
						buffer: renderer.createAttributeBuffer({
							data: this.geometryData.positions
						})
					})
				)
			}

			// Normal attribute — always provide one per vertex (shader requires `in vec3 normal`).
			const vertexCount = this.geometryData.positions.length / 3
			let normalData = this.geometryData.normals
			if (!normalData || normalData.length !== this.geometryData.positions.length) {
				normalData = new Float32Array(vertexCount * 3)
				for (let i = 0; i < vertexCount; i++) {
					normalData[i * 3 + 1] = 1
				}
			}
			attributes.push(
				renderer.createAttribute({
					name: 'normal',
					type: RendererTypes.AttributeType.Float32,
					format: RendererTypes.AttributeFormat.Float,
					size: 3,
					normalized: false,
					buffer: renderer.createAttributeBuffer({
						data: normalData
					})
				})
			)

			// UV attribute — always provide one per vertex (shader requires `in vec2 uv`).
			let uvData = this.geometryData.uvs
			if (!uvData || uvData.length !== vertexCount * 2) {
				uvData = new Float32Array(vertexCount * 2)
			}
			attributes.push(
				renderer.createAttribute({
					name: 'uv',
					type: RendererTypes.AttributeType.Float32,
					format: RendererTypes.AttributeFormat.Float,
					size: 2,
					normalized: false,
					buffer: renderer.createAttributeBuffer({
						data: uvData
					})
				})
			)

			// Create mesh
			const meshParams: any = {
				attributes: attributes
			}

			// Add indices if provided (indexed rendering)
			if (this.geometryData.indices && this.geometryData.indices.length > 0) {
				meshParams.indexed = true
				meshParams.indices = this.geometryData.indices
			}

			this.mesh = renderer.createMesh(meshParams)

			// Calculate bounding box for frustum culling
			// The bounding box is in local/model space - it will be transformed to world space
			// by the frustum culling check using matrixWorld
			if (this.geometryData.positions && this.geometryData.positions.length >= 3) {
				let minX = Infinity, minY = Infinity, minZ = Infinity
				let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity

				for (let i = 0; i < this.geometryData.positions.length; i += 3) {
					const x = this.geometryData.positions[i]
					const y = this.geometryData.positions[i + 1]
					const z = this.geometryData.positions[i + 2]

					minX = Math.min(minX, x)
					minY = Math.min(minY, y)
					minZ = Math.min(minZ, z)
					maxX = Math.max(maxX, x)
					maxY = Math.max(maxY, y)
					maxZ = Math.max(maxZ, z)
				}

				// Add padding to ensure bounding box is not too tight
				const padding = Math.max(0.1, (maxX - minX + maxY - minY + maxZ - minZ) / 3 * 0.1)
				this.setBoundingBox(
					new Vec3(minX - padding, minY - padding, minZ - padding),
					new Vec3(maxX + padding, maxY + padding, maxZ + padding)
				)
				
				const sizeX = maxX - minX
				const sizeY = maxY - minY
				const sizeZ = maxZ - minZ
				const maxSize = Math.max(sizeX, sizeY, sizeZ)
				
				console.log('[ExternalRenderableObject] Bounding box set (local space):', {
					min: { x: minX.toFixed(3), y: minY.toFixed(3), z: minZ.toFixed(3) },
					max: { x: maxX.toFixed(3), y: maxY.toFixed(3), z: maxZ.toFixed(3) },
					size: { x: sizeX.toFixed(3), y: sizeY.toFixed(3), z: sizeZ.toFixed(3) },
					maxSize: maxSize.toFixed(3),
					padding: padding.toFixed(3),
					note: `Bounding box will be transformed to world space during frustum culling. Max dimension: ${maxSize.toFixed(3)} units`
				})
			}

			console.log('[ExternalRenderableObject] Mesh created successfully')
		} catch (error) {
			console.error('[ExternalRenderableObject] Error creating mesh:', error)
		}
	}

	public setBaseColorTextureFromDataUrl(renderer: AbstractRenderer, dataUrl: string): void {
		if (this.baseColorTexture) {
			this.baseColorTexture.delete()
			this.baseColorTexture = null
		}
		this.useBaseColorMap = false

		const image = new Image()
		image.onload = () => {
			try {
				this.baseColorTexture = renderer.createTexture2D({
					width: image.width,
					height: image.height,
					data: image,
					minFilter: RendererTypes.MinFilter.Linear,
					magFilter: RendererTypes.MagFilter.Linear,
					wrap: RendererTypes.TextureWrap.Repeat,
					format: RendererTypes.TextureFormat.RGBA8Unorm,
					mipmaps: false,
					flipY: false
				})
				this.useBaseColorMap = true
				console.log('[ExternalRenderableObject] Base color texture loaded:', {
					width: image.width,
					height: image.height
				})
			} catch (error) {
				console.warn('[ExternalRenderableObject] Failed to create base color texture:', error)
			}
		}
		image.onerror = () => {
			console.warn('[ExternalRenderableObject] Failed to decode base color texture data URL')
		}
		image.src = dataUrl
	}

	public delete(): void {
		if (this.baseColorTexture) {
			this.baseColorTexture.delete()
			this.baseColorTexture = null
		}
		this.useBaseColorMap = false

		if (this.mesh) {
			// Delete all attribute buffers
			try {
				const positionAttr = this.mesh.getAttribute('position')
				if (positionAttr && positionAttr.buffer) {
					positionAttr.buffer.delete()
				}

				const normalAttr = this.mesh.getAttribute('normal')
				if (normalAttr && normalAttr.buffer) {
					normalAttr.buffer.delete()
				}

				const uvAttr = this.mesh.getAttribute('uv')
				if (uvAttr && uvAttr.buffer) {
					uvAttr.buffer.delete()
				}
			} catch (e) {
				console.warn('[ExternalRenderableObject] Error deleting attribute buffers:', e)
			}

			this.mesh.delete()
			this.mesh = null
		}
	}
}


