/**
 * Verification script for proxy configuration
 * Run this after restarting the server to verify proxy is working
 */

const http = require('http');

const tests = [
	{
		name: 'Vector Tile Test',
		path: '/vector/13/2412/3079',
		expectedStatus: 200,
		expectedContentType: 'application/x-protobuf'
	},
	{
		name: 'Vector Timestamp Test',
		path: '/vector.timestamp',
		expectedStatus: 200,
		expectedContentType: 'text/plain'
	}
];

function testProxy(test) {
	return new Promise((resolve) => {
		const options = {
			hostname: 'localhost',
			port: 8081,
			path: test.path,
			method: 'GET'
		};

		const req = http.request(options, (res) => {
			let data = '';
			res.on('data', (chunk) => {
				data += chunk;
			});
			res.on('end', () => {
				const contentType = res.headers['content-type'] || '';
				const success = res.statusCode === test.expectedStatus;
				
				resolve({
					name: test.name,
					path: test.path,
					statusCode: res.statusCode,
					expectedStatus: test.expectedStatus,
					contentType: contentType,
					expectedContentType: test.expectedContentType,
					dataLength: data.length,
					success: success,
					message: success 
						? `✅ PASS: Status ${res.statusCode}, Content-Type: ${contentType}, Size: ${data.length} bytes`
						: `❌ FAIL: Expected ${test.expectedStatus}, got ${res.statusCode}`
				});
			});
		});

		req.on('error', (error) => {
			resolve({
				name: test.name,
				path: test.path,
				success: false,
				error: error.message,
				message: `❌ ERROR: ${error.message}`
			});
		});

		req.setTimeout(5000, () => {
			req.destroy();
			resolve({
				name: test.name,
				path: test.path,
				success: false,
				error: 'Request timeout',
				message: '❌ ERROR: Request timeout (5s)'
			});
		});

		req.end();
	});
}

async function runTests() {
	console.log('========================================');
	console.log('Proxy Configuration Verification');
	console.log('========================================');
	console.log('');
	console.log('Testing proxy at: http://localhost:8081');
	console.log('Target: https://tiles.streets.gl');
	console.log('');
	console.log('Running tests...');
	console.log('');

	const results = await Promise.all(tests.map(test => testProxy(test)));

	let allPassed = true;
	results.forEach(result => {
		console.log(`${result.message}`);
		if (!result.success) {
			allPassed = false;
		}
		if (result.error) {
			console.log(`   Error: ${result.error}`);
		}
		console.log('');
	});

	console.log('========================================');
	if (allPassed) {
		console.log('✅ ALL TESTS PASSED - Proxy is working!');
		console.log('');
		console.log('Next steps:');
		console.log('  1. Open http://localhost:8081 in browser');
		console.log('  2. Check browser console for 200 status codes');
		console.log('  3. Verify 3D buildings appear on the map');
	} else {
		console.log('❌ SOME TESTS FAILED - Proxy may not be working');
		console.log('');
		console.log('Troubleshooting:');
		console.log('  1. Ensure server is running: npm run dev');
		console.log('  2. Check terminal for [Webpack Proxy] logs');
		console.log('  3. Verify webpack.config.js proxy configuration');
		console.log('  4. Try restarting the server');
	}
	console.log('========================================');
}

runTests().catch(console.error);






