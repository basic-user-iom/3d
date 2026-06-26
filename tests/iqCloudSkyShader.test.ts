import { describe, expect, it } from 'vitest'
import {
  getIqCloudSkyFragmentShader,
  IQ_CLOUD_SKY_VERTEX_SHADER,
  IQ_CLOUD_BASE,
  IQ_CLOUD_LAYER_HEIGHT
} from '../src/viewer/effects/IqCloudSkyShader'

describe('IqCloudSkyShader', () => {
  it('exports shader sources with iq raymarch primitives', () => {
    const fragment = getIqCloudSkyFragmentShader()
    expect(fragment).toContain('raymarchClouds')
    expect(fragment).toContain('mapDensity')
    expect(fragment).toContain('pow(sun, 8.0)')
    expect(fragment).toContain('gl_FragColor = vec4(col, 1.0)')
    expect(IQ_CLOUD_SKY_VERTEX_SHADER).toContain('vWorldPosition')
  })

  it('embeds cloud layer bounds in generated shader', () => {
    const fragment = getIqCloudSkyFragmentShader({
      cloudBase: IQ_CLOUD_BASE,
      cloudLayerHeight: IQ_CLOUD_LAYER_HEIGHT
    })
    expect(fragment).toContain(`CLOUD_BASE = ${IQ_CLOUD_BASE.toFixed(1)}`)
    expect(fragment).toContain(`CLOUD_TOP = ${(IQ_CLOUD_BASE + IQ_CLOUD_LAYER_HEIGHT).toFixed(1)}`)
  })
})
