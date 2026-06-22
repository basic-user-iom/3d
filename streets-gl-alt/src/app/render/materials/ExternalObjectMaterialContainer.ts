import Shaders from "../shaders/Shaders";
import MaterialContainer from "./MaterialContainer";
import {RendererTypes} from "~/lib/renderer/RendererTypes";
import AbstractRenderer from "~/lib/renderer/abstract-renderer/AbstractRenderer";

/**
 * Material container for external objects (cars, models from Three.js)
 * Uses a simple PBR shader similar to generic instances
 */
export default class ExternalObjectMaterialContainer extends MaterialContainer {
	public constructor(renderer: AbstractRenderer) {
		super(renderer);

		this.material = this.renderer.createMaterial({
			name: 'External object material (DEBUG neon)',
			uniforms: [
				{
					name: 'modelMatrix',
					block: 'MainBlock',
					type: RendererTypes.UniformType.Matrix4,
					value: new Float32Array(16)
				}, {
					name: 'viewMatrix',
					block: 'MainBlock',
					type: RendererTypes.UniformType.Matrix4,
					value: new Float32Array(16)
				}, {
					name: 'modelViewMatrixPrev',
					block: 'MainBlock',
					type: RendererTypes.UniformType.Matrix4,
					value: new Float32Array(16)
				}, {
					name: 'projectionMatrix',
					block: 'MainBlock',
					type: RendererTypes.UniformType.Matrix4,
					value: new Float32Array(16)
				}, 				{
					name: 'textureId',
					block: 'PerInstanceType',
					type: RendererTypes.UniformType.Float1,
					value: new Float32Array([0.0]) // Default to texture 0
				}, {
					name: 'color',
					block: 'PerInstanceType',
					type: RendererTypes.UniformType.Float3,
					value: new Float32Array([1.0, 1.0, 1.0]) // Default white, set per-object from ExternalRenderableObject.color
				}, {
					name: 'useBaseColorMap',
					block: 'PerInstanceType',
					type: RendererTypes.UniformType.Float1,
					value: new Float32Array([0.0])
				}, {
					name: 'pickingId',
					block: 'PerInstanceType',
					type: RendererTypes.UniformType.Int1,
					value: new Int32Array([0]) // 0 = empty/unpickable; set per-object for G-buffer picking
				}, {
					name: 'tMap',
					block: null,
					type: RendererTypes.UniformType.Texture2DArray,
					value: null
				}, {
					name: 'tBaseColor',
					block: null,
					type: RendererTypes.UniformType.Texture2D,
					value: this.renderer.createTexture2D({
						width: 1,
						height: 1,
						data: new Uint8Array([255, 255, 255, 255]),
						minFilter: RendererTypes.MinFilter.Linear,
						magFilter: RendererTypes.MagFilter.Linear,
						wrap: RendererTypes.TextureWrap.Repeat,
						format: RendererTypes.TextureFormat.RGBA8Unorm,
						mipmaps: false,
						flipY: false
					})
				}
			],
			primitive: {
				frontFace: RendererTypes.FrontFace.CCW,
				cullMode: RendererTypes.CullMode.Back
			},
			depth: {
				depthWrite: true,
				depthCompare: RendererTypes.DepthCompare.LessEqual
			},
			blend: {
				color: {
					operation: RendererTypes.BlendOperation.Add,
					srcFactor: RendererTypes.BlendFactor.One,
					dstFactor: RendererTypes.BlendFactor.Zero
				},
				alpha: {
					operation: RendererTypes.BlendOperation.Add,
					srcFactor: RendererTypes.BlendFactor.One,
					dstFactor: RendererTypes.BlendFactor.Zero
				}
			},
			// Non-instanced vertex shader (transforms `position` directly, no instance attributes),
			// paired with a fragment shader that outputs the object's real color.
			vertexShaderSource: Shaders.externalObject.vertex,
			fragmentShaderSource: Shaders.externalDebug.fragment
		});
	}
}

