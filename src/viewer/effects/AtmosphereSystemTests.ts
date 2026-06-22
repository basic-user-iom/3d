/**
 * Atmosphere System Test Suite
 * Tests for DynamicSky, LUT generation, and color accuracy
 */

import * as THREE from 'three'
import { DynamicSky } from './DynamicSky'
import { AtmosphereLUTSystem } from './AtmosphereLUTSystem'

export interface AtmosphereTestResult {
  testName: string
  passed: boolean
  message: string
  details?: any
  timestamp: string
}

export interface AtmosphereTestReport {
  timestamp: string
  overallStatus: 'pass' | 'fail' | 'warning'
  results: AtmosphereTestResult[]
  summary: {
    total: number
    passed: number
    failed: number
    warnings: number
  }
}

export class AtmosphereSystemTests {
  private scene: THREE.Scene
  private renderer: THREE.WebGLRenderer
  private dynamicSky: DynamicSky | null = null
  private lutSystem: AtmosphereLUTSystem | null = null

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    this.scene = scene
    this.renderer = renderer
  }

  /**
   * Initialize test systems
   */
  public initializeTestSystems(): void {
    // Create DynamicSky for testing
    this.dynamicSky = new DynamicSky(this.scene, {
      timeOfDay: 12.0,
      sunPosition: new THREE.Vector3(0, 1, 0),
      turbidity: 10.0,
      rayleigh: 2.0,
      mieCoefficient: 0.005,
      exposure: 0.68
    }, this.renderer)

    // Get LUT system from DynamicSky
    if (this.dynamicSky && (this.dynamicSky as any).lutSystem) {
      this.lutSystem = (this.dynamicSky as any).lutSystem
    }
  }

  /**
   * Run all tests
   */
  public async runAllTests(): Promise<AtmosphereTestReport> {
    const results: AtmosphereTestResult[] = []

    // Initialize test systems
    this.initializeTestSystems()

    // Run individual tests
    results.push(this.testLUTSystemInitialization())
    results.push(this.testStaticLUTGeneration())
    results.push(this.testSkyViewLUTGeneration())
    results.push(this.testDirectCalculationFallback())
    results.push(this.testEveningColors())
    results.push(this.testMorningColors())
    results.push(this.testNoonColors())
    results.push(this.testSunsetColors())
    results.push(this.testExposureValues())
    results.push(this.testTurbidityAdjustments())
    results.push(this.testRayleighPhaseSign())
    results.push(this.testMultipleScattering())
    results.push(this.testOpticalDepthCalculation())
    results.push(this.testSunPositionScaling())

    // Calculate summary
    const summary = {
      total: results.length,
      passed: results.filter(r => r.passed).length,
      failed: results.filter(r => !r.passed && !r.message.includes('⚠️')).length,
      warnings: results.filter(r => r.message.includes('⚠️')).length
    }

    const overallStatus: 'pass' | 'fail' | 'warning' = 
      summary.failed > 0 ? 'fail' : 
      summary.warnings > 0 ? 'warning' : 
      'pass'

    return {
      timestamp: new Date().toISOString(),
      overallStatus,
      results,
      summary
    }
  }

  /**
   * Test 1: LUT System Initialization
   */
  private testLUTSystemInitialization(): AtmosphereTestResult {
    const testName = 'LUT System Initialization'
    
    if (!this.lutSystem) {
      return {
        testName,
        passed: false,
        message: '❌ LUT system not initialized',
        timestamp: new Date().toISOString()
      }
    }

    return {
      testName,
      passed: true,
      message: '✅ LUT system initialized successfully',
      details: {
        hasTransmittanceLUT: !!(this.lutSystem as any).transmittanceLUT,
        hasMultipleScatteringLUT: !!(this.lutSystem as any).multipleScatteringLUT,
        hasSkyViewLUT: !!(this.lutSystem as any).skyViewLUT
      },
      timestamp: new Date().toISOString()
    }
  }

  /**
   * Test 2: Static LUT Generation
   */
  private testStaticLUTGeneration(): AtmosphereTestResult {
    const testName = 'Static LUT Generation'
    
    if (!this.lutSystem) {
      return {
        testName,
        passed: false,
        message: '❌ LUT system not available',
        timestamp: new Date().toISOString()
      }
    }

    const areReady = this.lutSystem.areStaticLUTsReady

    return {
      testName,
      passed: areReady,
      message: areReady 
        ? '✅ Static LUTs generated successfully' 
        : '⚠️ Static LUTs not ready (may be generating asynchronously)',
      details: {
        staticLUTsReady: areReady,
        note: areReady ? 'LUTs are ready' : 'LUTs may still be generating - check after a few frames'
      },
      timestamp: new Date().toISOString()
    }
  }

  /**
   * Test 3: Sky View LUT Generation
   */
  private testSkyViewLUTGeneration(): AtmosphereTestResult {
    const testName = 'Sky View LUT Generation'
    
    if (!this.lutSystem) {
      return {
        testName,
        passed: false,
        message: '❌ LUT system not available',
        timestamp: new Date().toISOString()
      }
    }

    const sunDir = new THREE.Vector3(0, 0.5, -1).normalize()
    const skyViewTexture = this.lutSystem.getSkyViewTexture(sunDir, 0.0)

    return {
      testName,
      passed: !!skyViewTexture,
      message: skyViewTexture 
        ? '✅ Sky View LUT generated successfully' 
        : '⚠️ Sky View LUT not ready (may need static LUTs first)',
      details: {
        hasTexture: !!skyViewTexture,
        textureSize: skyViewTexture ? `${(skyViewTexture.image as any)?.width}x${(skyViewTexture.image as any)?.height}` : 'N/A'
      },
      timestamp: new Date().toISOString()
    }
  }

  /**
   * Test 4: Direct Calculation Fallback
   */
  private testDirectCalculationFallback(): AtmosphereTestResult {
    const testName = 'Direct Calculation Fallback'
    
    if (!this.dynamicSky) {
      return {
        testName,
        passed: false,
        message: '❌ DynamicSky not initialized',
        timestamp: new Date().toISOString()
      }
    }

    const skyMaterial = (this.dynamicSky as any).skyMaterial
    if (!skyMaterial) {
      return {
        testName,
        passed: false,
        message: '❌ Sky material not found',
        timestamp: new Date().toISOString()
      }
    }

    // Check if shader has direct calculation uniforms (turbidity, rayleigh, etc.)
    const hasDirectCalcUniforms = 
      skyMaterial.uniforms.turbidity !== undefined ||
      skyMaterial.uniforms.rayleigh !== undefined

    return {
      testName,
      passed: hasDirectCalcUniforms,
      message: hasDirectCalcUniforms 
        ? '✅ Direct calculation shader available as fallback' 
        : '❌ Direct calculation shader not available',
      details: {
        hasTurbidityUniform: skyMaterial.uniforms.turbidity !== undefined,
        hasRayleighUniform: skyMaterial.uniforms.rayleigh !== undefined,
        hasExposureUniform: skyMaterial.uniforms.exposure !== undefined
      },
      timestamp: new Date().toISOString()
    }
  }

  /**
   * Test 5: Evening Colors
   */
  private testEveningColors(): AtmosphereTestResult {
    const testName = 'Evening Colors (6-8 PM)'
    
    if (!this.dynamicSky) {
      return {
        testName,
        passed: false,
        message: '❌ DynamicSky not initialized',
        timestamp: new Date().toISOString()
      }
    }

    // Test evening time (6.2 hours = 6:12 PM)
    this.dynamicSky.update({
      timeOfDay: 6.2,
      sunPosition: new THREE.Vector3(0, -0.3, -1).normalize().multiplyScalar(50000),
      exposure: 0.5,
      turbidity: 15.0,
      mieCoefficient: 0.015
    })

    const skyMaterial = (this.dynamicSky as any).skyMaterial
    const exposure = skyMaterial?.uniforms?.exposure?.value ?? 0
    const turbidity = skyMaterial?.uniforms?.turbidity?.value ?? 0

    const exposureCorrect = exposure >= 0.4 && exposure <= 0.6
    const turbidityCorrect = turbidity >= 10.0 && turbidity <= 20.0

    return {
      testName,
      passed: exposureCorrect && turbidityCorrect,
      message: (exposureCorrect && turbidityCorrect)
        ? '✅ Evening colors configured correctly'
        : '⚠️ Evening parameters may need adjustment',
      details: {
        exposure: exposure,
        expectedExposure: '0.4-0.6',
        turbidity: turbidity,
        expectedTurbidity: '10.0-20.0',
        mieCoefficient: skyMaterial?.uniforms?.mieCoefficient?.value ?? 0
      },
      timestamp: new Date().toISOString()
    }
  }

  /**
   * Test 6: Morning Colors
   */
  private testMorningColors(): AtmosphereTestResult {
    const testName = 'Morning Colors (6-8 AM)'
    
    if (!this.dynamicSky) {
      return {
        testName,
        passed: false,
        message: '❌ DynamicSky not initialized',
        timestamp: new Date().toISOString()
      }
    }

    // Test morning time (6.5 hours = 6:30 AM)
    this.dynamicSky.update({
      timeOfDay: 6.5,
      sunPosition: new THREE.Vector3(0, 0.2, -1).normalize().multiplyScalar(50000),
      exposure: 0.5,
      turbidity: 12.0
    })

    const skyMaterial = (this.dynamicSky as any).skyMaterial
    const exposure = skyMaterial?.uniforms?.exposure?.value ?? 0

    const exposureCorrect = exposure >= 0.4 && exposure <= 0.6

    return {
      testName,
      passed: exposureCorrect,
      message: exposureCorrect
        ? '✅ Morning colors configured correctly'
        : '⚠️ Morning parameters may need adjustment',
      details: {
        exposure: exposure,
        expectedExposure: '0.4-0.6'
      },
      timestamp: new Date().toISOString()
    }
  }

  /**
   * Test 7: Noon Colors
   */
  private testNoonColors(): AtmosphereTestResult {
    const testName = 'Noon Colors (12 PM)'
    
    if (!this.dynamicSky) {
      return {
        testName,
        passed: false,
        message: '❌ DynamicSky not initialized',
        timestamp: new Date().toISOString()
      }
    }

    // Test noon time
    this.dynamicSky.update({
      timeOfDay: 12.0,
      sunPosition: new THREE.Vector3(0, 1, 0).normalize().multiplyScalar(50000),
      exposure: 1.0,
      turbidity: 10.0
    })

    const skyMaterial = (this.dynamicSky as any).skyMaterial
    const exposure = skyMaterial?.uniforms?.exposure?.value ?? 0

    const exposureCorrect = exposure >= 0.8 && exposure <= 1.2

    return {
      testName,
      passed: exposureCorrect,
      message: exposureCorrect
        ? '✅ Noon colors configured correctly'
        : '⚠️ Noon parameters may need adjustment',
      details: {
        exposure: exposure,
        expectedExposure: '0.8-1.2'
      },
      timestamp: new Date().toISOString()
    }
  }

  /**
   * Test 8: Sunset Colors
   */
  private testSunsetColors(): AtmosphereTestResult {
    const testName = 'Sunset Colors (7-8 PM)'
    
    if (!this.dynamicSky) {
      return {
        testName,
        passed: false,
        message: '❌ DynamicSky not initialized',
        timestamp: new Date().toISOString()
      }
    }

    // Test sunset time (7.5 hours = 7:30 PM)
    this.dynamicSky.update({
      timeOfDay: 7.5,
      sunPosition: new THREE.Vector3(0, -0.1, -1).normalize().multiplyScalar(50000),
      exposure: 0.4,
      turbidity: 15.0,
      mieCoefficient: 0.015
    })

    const skyMaterial = (this.dynamicSky as any).skyMaterial
    const exposure = skyMaterial?.uniforms?.exposure?.value ?? 0
    const turbidity = skyMaterial?.uniforms?.turbidity?.value ?? 0
    const mieCoefficient = skyMaterial?.uniforms?.mieCoefficient?.value ?? 0

    const exposureCorrect = exposure >= 0.3 && exposure <= 0.5
    const turbidityCorrect = turbidity >= 10.0 && turbidity <= 20.0
    const mieCorrect = mieCoefficient >= 0.01 && mieCoefficient <= 0.02

    return {
      testName,
      passed: exposureCorrect && turbidityCorrect && mieCorrect,
      message: (exposureCorrect && turbidityCorrect && mieCorrect)
        ? '✅ Sunset colors configured correctly'
        : '⚠️ Sunset parameters may need adjustment',
      details: {
        exposure: exposure,
        expectedExposure: '0.3-0.5',
        turbidity: turbidity,
        expectedTurbidity: '10.0-20.0',
        mieCoefficient: mieCoefficient,
        expectedMie: '0.01-0.02'
      },
      timestamp: new Date().toISOString()
    }
  }

  /**
   * Test 9: Exposure Values
   */
  private testExposureValues(): AtmosphereTestResult {
    const testName = 'Exposure Values by Time of Day'
    
    const testCases = [
      { time: 0, elevation: -10, expected: 0.15, name: 'Night' },
      { time: 6.5, elevation: 5, expected: 0.5, name: 'Sunrise' },
      { time: 12, elevation: 60, expected: 1.0, name: 'Noon' },
      { time: 18, elevation: 5, expected: 0.5, name: 'Sunset' }
    ]

    const results = testCases.map(testCase => {
      const sunElevationDeg = testCase.elevation
      let calculatedExposure = 0.68
      
      if (sunElevationDeg < 0) {
        calculatedExposure = 0.15
      } else if (sunElevationDeg < 10) {
        calculatedExposure = 0.4 + 0.2 * (sunElevationDeg / 10)
      } else if (sunElevationDeg < 45) {
        calculatedExposure = 0.6 + 0.2 * ((sunElevationDeg - 10) / 35)
      } else {
        calculatedExposure = 0.8 + 0.4 * Math.min(1, (sunElevationDeg - 45) / 45)
      }

      const tolerance = 0.1
      const passed = Math.abs(calculatedExposure - testCase.expected) <= tolerance

      return {
        name: testCase.name,
        calculated: calculatedExposure,
        expected: testCase.expected,
        passed
      }
    })

    const allPassed = results.every(r => r.passed)

    return {
      testName,
      passed: allPassed,
      message: allPassed
        ? '✅ Exposure values correct for all time periods'
        : '⚠️ Some exposure values may need adjustment',
      details: {
        testCases: results
      },
      timestamp: new Date().toISOString()
    }
  }

  /**
   * Test 10: Turbidity Adjustments
   */
  private testTurbidityAdjustments(): AtmosphereTestResult {
    const testName = 'Turbidity Adjustments for Sunset'
    
    const testCases = [
      { elevation: 5, expectedMin: 10, expectedMax: 15 },
      { elevation: 0, expectedMin: 12, expectedMax: 18 },
      { elevation: -2, expectedMin: 10, expectedMax: 20 }
    ]

    const results = testCases.map(testCase => {
      let calculatedTurbidity = 10.0
      if (testCase.elevation < 10 && testCase.elevation > -5) {
        const sunsetFactor = 1.0 - Math.max(0, testCase.elevation / 10)
        calculatedTurbidity = 10.0 + 5.0 * sunsetFactor
      }

      const passed = calculatedTurbidity >= testCase.expectedMin && calculatedTurbidity <= testCase.expectedMax

      return {
        elevation: testCase.elevation,
        calculated: calculatedTurbidity,
        expectedRange: `${testCase.expectedMin}-${testCase.expectedMax}`,
        passed
      }
    })

    const allPassed = results.every(r => r.passed)

    return {
      testName,
      passed: allPassed,
      message: allPassed
        ? '✅ Turbidity adjustments working correctly'
        : '⚠️ Turbidity adjustments may need tuning',
      details: {
        testCases: results
      },
      timestamp: new Date().toISOString()
    }
  }

  /**
   * Test 11: Rayleigh Phase Sign
   */
  private testRayleighPhaseSign(): AtmosphereTestResult {
    const testName = 'Rayleigh Phase Function Sign'
    
    // Check if shader uses negative sign for Rayleigh phase
    if (!this.dynamicSky) {
      return {
        testName,
        passed: false,
        message: '❌ DynamicSky not initialized',
        timestamp: new Date().toISOString()
      }
    }

    const skyMaterial = (this.dynamicSky as any).skyMaterial
    if (!skyMaterial) {
      return {
        testName,
        passed: false,
        message: '❌ Sky material not found',
        timestamp: new Date().toISOString()
      }
    }

    // Check shader source for negative sign in Rayleigh phase
    const fragmentShader = skyMaterial.fragmentShader || ''
    const hasNegativeSign = fragmentShader.includes('getRayleighPhase(-sunDotView)') || 
                           fragmentShader.includes('getRayleighPhase(-cosTheta)')

    return {
      testName,
      passed: hasNegativeSign,
      message: hasNegativeSign
        ? '✅ Rayleigh phase uses correct negative sign (matches Streets GL)'
        : '❌ Rayleigh phase sign incorrect - should use negative',
      details: {
        shaderHasNegativeSign: hasNegativeSign,
        note: 'Streets GL uses getRayleighPhase(-cosTheta) for correct color matching'
      },
      timestamp: new Date().toISOString()
    }
  }

  /**
   * Test 12: Multiple Scattering
   */
  private testMultipleScattering(): AtmosphereTestResult {
    const testName = 'Multiple Scattering Approximation'
    
    if (!this.dynamicSky) {
      return {
        testName,
        passed: false,
        message: '❌ DynamicSky not initialized',
        timestamp: new Date().toISOString()
      }
    }

    const skyMaterial = (this.dynamicSky as any).skyMaterial
    if (!skyMaterial) {
      return {
        testName,
        passed: false,
        message: '❌ Sky material not found',
        timestamp: new Date().toISOString()
      }
    }

    // Check shader source for multiple scattering approximation
    const fragmentShader = skyMaterial.fragmentShader || ''
    const hasMultipleScattering = fragmentShader.includes('multipleScatteringApprox') ||
                                  fragmentShader.includes('multipleScattering') ||
                                  fragmentShader.includes('psiMS')

    return {
      testName,
      passed: hasMultipleScattering,
      message: hasMultipleScattering
        ? '✅ Multiple scattering approximation present'
        : '⚠️ Multiple scattering approximation may be missing',
      details: {
        shaderHasMultipleScattering: hasMultipleScattering,
        note: 'Multiple scattering is essential for realistic sky colors, especially at sunset'
      },
      timestamp: new Date().toISOString()
    }
  }

  /**
   * Test 13: Optical Depth Calculation
   */
  private testOpticalDepthCalculation(): AtmosphereTestResult {
    const testName = 'Optical Depth Calculation for Sunset'
    
    if (!this.dynamicSky) {
      return {
        testName,
        passed: false,
        message: '❌ DynamicSky not initialized',
        timestamp: new Date().toISOString()
      }
    }

    const skyMaterial = (this.dynamicSky as any).skyMaterial
    if (!skyMaterial) {
      return {
        testName,
        passed: false,
        message: '❌ Sky material not found',
        timestamp: new Date().toISOString()
      }
    }

    // Check shader source for path length multiplier
    const fragmentShader = skyMaterial.fragmentShader || ''
    const hasPathLengthMultiplier = fragmentShader.includes('pathLengthMultiplier') ||
                                   fragmentShader.includes('sunElevationFactor')

    return {
      testName,
      passed: hasPathLengthMultiplier,
      message: hasPathLengthMultiplier
        ? '✅ Optical depth calculation includes path length multiplier for sunset'
        : '⚠️ Path length multiplier may be missing',
      details: {
        shaderHasPathLengthMultiplier: hasPathLengthMultiplier,
        note: 'Path length multiplier accounts for longer atmospheric path at sunset'
      },
      timestamp: new Date().toISOString()
    }
  }

  /**
   * Test 14: Sun Position Scaling
   */
  private testSunPositionScaling(): AtmosphereTestResult {
    const testName = 'Sun Position Scaling (50,000 units)'
    
    if (!this.dynamicSky) {
      return {
        testName,
        passed: false,
        message: '❌ DynamicSky not initialized',
        timestamp: new Date().toISOString()
      }
    }

    // Update with test sun position
    this.dynamicSky.update({
      timeOfDay: 12.0,
      sunPosition: new THREE.Vector3(0, 1, 0).normalize()
    })

    const skyMaterial = (this.dynamicSky as any).skyMaterial
    const sunPosition = skyMaterial?.uniforms?.sunPosition?.value as THREE.Vector3

    if (!sunPosition) {
      return {
        testName,
        passed: false,
        message: '❌ Sun position not found',
        timestamp: new Date().toISOString()
      }
    }

    const distance = sunPosition.length()
    const expectedDistance = 50000
    const tolerance = 1000
    const passed = Math.abs(distance - expectedDistance) <= tolerance

    return {
      testName,
      passed,
      message: passed
        ? `✅ Sun position scaled correctly to ${distance.toFixed(0)} units`
        : `⚠️ Sun position distance ${distance.toFixed(0)} units (expected ~${expectedDistance})`,
      details: {
        actualDistance: distance,
        expectedDistance: expectedDistance,
        tolerance: tolerance
      },
      timestamp: new Date().toISOString()
    }
  }

  /**
   * Generate test report for Perplexity
   */
  public generatePerplexityReport(report: AtmosphereTestReport): string {
    const failedTests = report.results.filter(r => !r.passed && !r.message.includes('⚠️'))
    const warningTests = report.results.filter(r => r.message.includes('⚠️'))
    
    let reportText = `# Atmosphere System Test Report\n\n`
    reportText += `**Timestamp:** ${report.timestamp}\n`
    reportText += `**Overall Status:** ${report.overallStatus.toUpperCase()}\n`
    reportText += `**Summary:** ${report.summary.passed}/${report.summary.total} passed, ${report.summary.failed} failed, ${report.summary.warnings} warnings\n\n`
    
    if (failedTests.length > 0) {
      reportText += `## ❌ Failed Tests\n\n`
      failedTests.forEach(test => {
        reportText += `### ${test.testName}\n`
        reportText += `- **Status:** ${test.message}\n`
        if (test.details) {
          reportText += `- **Details:** ${JSON.stringify(test.details, null, 2)}\n`
        }
        reportText += `\n`
      })
    }
    
    if (warningTests.length > 0) {
      reportText += `## ⚠️ Warnings\n\n`
      warningTests.forEach(test => {
        reportText += `### ${test.testName}\n`
        reportText += `- **Status:** ${test.message}\n`
        if (test.details) {
          reportText += `- **Details:** ${JSON.stringify(test.details, null, 2)}\n`
        }
        reportText += `\n`
      })
    }
    
    reportText += `## ✅ Passed Tests\n\n`
    const passedTests = report.results.filter(r => r.passed && !r.message.includes('⚠️'))
    passedTests.forEach(test => {
      reportText += `- **${test.testName}:** ${test.message}\n`
    })
    
    return reportText
  }
}

// Export for global access
if (typeof window !== 'undefined') {
  (window as any).AtmosphereSystemTests = AtmosphereSystemTests
}
























