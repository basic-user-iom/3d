import { describe, it, expect } from 'vitest'
import {
  getShadowAuthority,
  resolveDirectionalCastShadow,
  resolveLightingMode,
  shouldSunUseLegacyShadowMaps
} from '../src/viewer/utils/lightingContext'

/**
 * HDR must not disable shadow map flags — contrast is tuned via ambient/probe/envMapIntensity.
 */
describe('HDR does not disable shadow flags', () => {
  const hdrOn = {
    enableStandaloneWeather: false,
    streetsGLIframeOverlay: false,
    pathTracerActive: false,
    hdrEnabled: true,
    hdrGroundProjectionEnabled: false
  }

  it('standard + HDR keeps legacy sun shadow authority', () => {
    expect(resolveLightingMode(hdrOn)).toBe('standard')
    expect(getShadowAuthority('standard', false)).toBe('standard')
    expect(shouldSunUseLegacyShadowMaps('standard', false)).toBe(true)
    expect(
      resolveDirectionalCastShadow({
        mode: 'standard',
        csmEnabled: false,
        isSun: true,
        enabled: true,
        castShadowConfig: true,
        shadowsEnabled: true
      })
    ).toBe(true)
  })

  it('HDR + standalone weather keeps CSM shadow authority', () => {
    const mode = resolveLightingMode({ ...hdrOn, enableStandaloneWeather: true })
    expect(mode).toBe('standalone-weather')
    expect(getShadowAuthority(mode, true)).toBe('csm')
    expect(shouldSunUseLegacyShadowMaps(mode, true)).toBe(false)
    expect(
      resolveDirectionalCastShadow({
        mode,
        csmEnabled: true,
        isSun: true,
        enabled: true,
        castShadowConfig: true,
        shadowsEnabled: true
      })
    ).toBe(false)
  })

  it('only shadowsEnabled=false disables castShadow — not hdrEnabled', () => {
    expect(
      resolveDirectionalCastShadow({
        mode: 'standard',
        csmEnabled: false,
        isSun: true,
        enabled: true,
        castShadowConfig: true,
        shadowsEnabled: false
      })
    ).toBe(false)
    expect(
      resolveDirectionalCastShadow({
        mode: 'standard',
        csmEnabled: false,
        isSun: true,
        enabled: true,
        castShadowConfig: true,
        shadowsEnabled: true
      })
    ).toBe(true)
  })
})
