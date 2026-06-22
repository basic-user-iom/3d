// Service Worker to intercept Google 3D Tiles requests
let GOOGLE_API_KEY = null;
let ACCESS_TOKEN = null;

// Listen for credential updates from main thread
self.addEventListener('message', (event) => {
	if (event.data && event.data.type === 'UPDATE_CREDENTIALS') {
		GOOGLE_API_KEY = event.data.googleApiKey;
		ACCESS_TOKEN = event.data.accessToken;
		console.log('[SW] Updated credentials');
	}
});

self.addEventListener('fetch', (event) => {
	const url = event.request.url;
	
	// Intercept Google tile requests
	if (url.includes('tile.googleapis.com')) {
		// Add API key to URL if missing
		let modifiedUrl = url;
		if (!url.includes('key=') && GOOGLE_API_KEY) {
			const separator = url.includes('?') ? '&' : '?';
			modifiedUrl = url + separator + 'key=' + encodeURIComponent(GOOGLE_API_KEY);
			console.log('[SW] Added key to URL:', modifiedUrl.substring(0, 100));
		}
		
		// Clone request and add headers
		const headers = new Headers(event.request.headers);
		if (GOOGLE_API_KEY && !headers.has('X-Goog-Api-Key')) {
			headers.set('X-Goog-Api-Key', GOOGLE_API_KEY);
		}
		if (ACCESS_TOKEN && !headers.has('Authorization')) {
			headers.set('Authorization', 'Bearer ' + ACCESS_TOKEN);
		}
		
		const modifiedRequest = new Request(modifiedUrl, {
			method: event.request.method,
			headers: headers,
			body: event.request.body,
			mode: event.request.mode,
			credentials: event.request.credentials,
			cache: event.request.cache,
			redirect: event.request.redirect,
			referrer: event.request.referrer
		});
		
		event.respondWith(fetch(modifiedRequest));
		return;
	}
	
	// For root.json, also modify the response if it's JSON
	if (url.includes('root.json') && url.includes('tile.googleapis.com')) {
		event.respondWith(
			fetch(event.request).then(async (response) => {
				if (response.ok) {
					const clonedResponse = response.clone();
					const json = await clonedResponse.json();
					
					// Modify all tile URLs in JSON
					const modifyUrls = (obj, depth = 0) => {
						if (typeof obj !== 'object' || obj === null || depth > 20) return;
						
						if (obj.content && obj.content.uri) {
							const tileUrl = obj.content.uri;
							if (tileUrl.includes('tile.googleapis.com') && !tileUrl.includes('key=') && GOOGLE_API_KEY) {
								const separator = tileUrl.includes('?') ? '&' : '?';
								obj.content.uri = tileUrl + separator + 'key=' + encodeURIComponent(GOOGLE_API_KEY);
								console.log('[SW] Modified tile URL in root.json');
							}
						}
						
						if (obj.uri && typeof obj.uri === 'string' && obj.uri.includes('tile.googleapis.com') && !obj.uri.includes('key=') && GOOGLE_API_KEY) {
							const separator = obj.uri.includes('?') ? '&' : '?';
							obj.uri = obj.uri + separator + 'key=' + encodeURIComponent(GOOGLE_API_KEY);
						}
						
						for (const key in obj) {
							if (Array.isArray(obj[key])) {
								obj[key].forEach(item => modifyUrls(item, depth + 1));
							} else if (typeof obj[key] === 'object' && obj[key] !== null) {
								modifyUrls(obj[key], depth + 1);
							}
						}
					};
					
					modifyUrls(json);
					
					return new Response(JSON.stringify(json), {
						status: response.status,
						statusText: response.statusText,
						headers: response.headers
					});
				}
				return response;
			})
		);
		return;
	}
});













