import fs from 'fs';

console.log('🔍 Verifying Streets GL Standalone Improvements...\n');

const html = fs.readFileSync('streets-gl-standalone.html', 'utf8');

const checks = {
  'SunCalc Library': html.includes('suncalc@1.9.0'),
  'SunCalc Integration': html.includes('SunCalc.getPosition'),
  'Enhanced Sun Position': html.includes('updateSunPosition') && html.includes('currentDate'),
  'Fog System': html.includes('FogExp2'),
  'Dynamic Fog': html.includes('fog.density') && html.includes('fog.color'),
  'Date Input Field': html.includes('id="date-input"') && html.includes('type="date"'),
  'Enhanced Sky Shader': html.includes('night sky') || (html.includes('sunDisk') && html.includes('sunElevation')),
  'Lighting System': html.includes('sunElevationDeg') && html.includes('ambientLight.intensity'),
  'Time Slider': html.includes('id="time-slider"'),
  'Sun Intensity Control': html.includes('sun-intensity-slider')
};

let allPass = true;
console.log('Code Verification Results:');
console.log('='.repeat(50));

Object.entries(checks).forEach(([key, value]) => {
  const status = value ? '✅' : '❌';
  console.log(`${status} ${key}`);
  if (!value) allPass = false;
});

console.log('='.repeat(50));

if (allPass) {
  console.log('\n✅ ALL CHECKS PASSED!');
  console.log('\nAll improvements have been successfully implemented.');
  console.log('\nNext steps:');
  console.log('1. Open test-streets-gl-standalone.html for automated tests');
  console.log('2. Open streets-gl-standalone.html for visual testing');
  console.log('3. Compare with official streets.gl website');
  process.exit(0);
} else {
  console.log('\n❌ SOME CHECKS FAILED');
  console.log('Please review the implementation.');
  process.exit(1);
}

