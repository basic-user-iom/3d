const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const {CleanWebpackPlugin} = require('clean-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
// ESLintPlugin disabled to avoid conflict with parent .eslintrc.cjs
// const ESLintPlugin = require('eslint-webpack-plugin');
const {EsbuildPlugin} = require('esbuild-loader');

const childProcess = require('child_process');
const {DefinePlugin} = require("webpack");
let COMMIT_SHA = process.env.SOURCE_COMMIT || process.env.GITHUB_SHA || 'alt-installation';
let COMMIT_BRANCH = process.env.COOLIFY_BRANCH || process.env.GITHUB_REF_NAME || 'alt-branch';
try {
	COMMIT_SHA = childProcess.execSync('git rev-parse HEAD').toString().trim();
	COMMIT_BRANCH = childProcess.execSync("git rev-parse --abbrev-ref HEAD").toString().trim();
} catch (e) {
	// Not in a git repo, use defaults
}
const VERSION = require('./package.json').version;

module.exports = (env, argv) => ([{
	entry: './src/app/App.ts',
	output: {
		filename: './js/index.[contenthash].js',
		path: path.resolve(__dirname, 'build')
	},
	// ESLint completely disabled - no config files, no plugin
	performance: {
		maxEntrypointSize: 8000000,
		maxAssetSize: 8000000
	},
	optimization: {
		minimizer: [
			new EsbuildPlugin({
				target: 'es2020'
			})
		]
	},
	devServer: {
		hot: true,
		port: 8081,
		open: true,
		host: 'localhost',
		client: {
			overlay: {
				errors: true,
				warnings: false
			}
		},
		// Proxy to bypass CORS for tiles.streets.gl
		// Using both proxy object (for compatibility) and setupMiddlewares (for webpack-dev-server 4.x)
		proxy: {
			'/vector': {
				target: 'https://tiles.streets.gl',
				changeOrigin: true,
				secure: true,
				logLevel: 'debug',
				ws: false,
				onProxyReq: (proxyReq, req, res) => {
					console.log(`[Webpack Proxy] ${req.method} ${req.url} -> https://tiles.streets.gl${req.url}`);
				},
				onProxyRes: (proxyRes, req, res) => {
					console.log(`[Webpack Proxy] Response: ${req.url} -> ${proxyRes.statusCode}`);
				},
				onError: (err, req, res) => {
					console.error(`[Webpack Proxy] Error for ${req.url}:`, err.message);
				}
			},
			'/vector.timestamp': {
				target: 'https://tiles.streets.gl',
				changeOrigin: true,
				secure: true,
				logLevel: 'debug'
			}
		},
		// Also use setupMiddlewares to ensure proxy works (webpack-dev-server 4.x)
		// This is set up ALWAYS (not just as backup) to ensure proxy works reliably
		setupMiddlewares: (middlewares, devServer) => {
			if (!devServer) {
				return middlewares;
			}
			
			try {
				const { createProxyMiddleware } = require('http-proxy-middleware');
				
				// Always set up proxy middleware via setupMiddlewares for webpack-dev-server 4.x
				// This ensures proxy works even if proxy object has issues
				console.log('[Webpack Proxy] Setting up proxy via setupMiddlewares...');
				devServer.app.use(
					'/vector',
					createProxyMiddleware({
						target: 'https://tiles.streets.gl',
						changeOrigin: true,
						secure: true,
						logLevel: 'debug',
						ws: false,
						onProxyReq: (proxyReq, req, res) => {
							console.log(`[Webpack Proxy Middleware] ${req.method} ${req.url} -> https://tiles.streets.gl${req.url}`);
						},
						onProxyRes: (proxyRes, req, res) => {
							console.log(`[Webpack Proxy Middleware] Response: ${req.url} -> ${proxyRes.statusCode}`);
						}
					})
				);
				
				devServer.app.use(
					'/vector.timestamp',
					createProxyMiddleware({
						target: 'https://tiles.streets.gl',
						changeOrigin: true,
						secure: true,
						logLevel: 'debug',
						onProxyReq: (proxyReq, req, res) => {
							console.log(`[Webpack Proxy Middleware] ${req.method} ${req.url} -> https://tiles.streets.gl${req.url}`);
						},
						onProxyRes: (proxyRes, req, res) => {
							console.log(`[Webpack Proxy Middleware] Response: ${req.url} -> ${proxyRes.statusCode}`);
						}
					})
				);
				
				console.log('[Webpack Proxy] Proxy middleware setup complete!');
			} catch (error) {
				console.error('[Webpack Proxy] Error setting up middleware:', error);
			}
			
			return middlewares;
		}
	},
	devtool: argv.mode === 'production' ? undefined : 'inline-source-map',
	plugins: [
		new CleanWebpackPlugin(),
		new HtmlWebpackPlugin({
			filename: 'index.html',
			template: './src/index.html',
			minify: argv.mode === 'production'
		}),
		new MiniCssExtractPlugin(),
		new CopyPlugin({
			patterns: [
				{from: './src/resources/textures', to: path.resolve(__dirname, 'build/textures')},
				{from: './src/resources/models', to: path.resolve(__dirname, 'build/models')},
				{from: './src/resources/images', to: path.resolve(__dirname, 'build/images')},
				{from: './src/resources/misc', to: path.resolve(__dirname, 'build/misc')}
			]
		}),
		// ESLintPlugin completely removed to avoid conflict with parent .eslintrc.cjs
		// ESLint is disabled for this project - no linting during build
		new DefinePlugin({
			COMMIT_SHA: JSON.stringify(COMMIT_SHA),
			COMMIT_BRANCH: JSON.stringify(COMMIT_BRANCH),
			VERSION: JSON.stringify(VERSION)
		})
	],
	module: {
		rules: [
			{
				test: /\.vert|.frag|.glsl$/i,
				use: [
					{
						loader: 'raw-loader',
						options: {
							esModule: false,
						},
					},
				]
			}, {
				test: /\.css$/i,
				use: [MiniCssExtractPlugin.loader, 'css-loader']
			}, {
				test: /\.s[ac]ss$/i,
				use: [
					'style-loader',
					{
						loader: 'css-loader',
						options: {
							importLoaders: 1,
							modules: true,
							url: false
						},
					},
					'sass-loader'
				],
				sideEffects: true
			}, {
				test: /\.[jt]sx?$/,
				loader: 'esbuild-loader',
				options: {
					target: 'es2020',
					tsconfig: argv.mode === 'production' ? 'tsconfig.prod.json' : 'tsconfig.json'
				}
			},
		]
	},
		resolve: {
		extensions: ['.ts', '.js', '.tsx'],
		alias: {
			'~': path.resolve(__dirname, 'src')
		},
		fallback: {
			url: require.resolve('url'),
			path: require.resolve('path-browserify'),
			fs: false,
		}
	},
	// Completely disable ESLint to prevent conflicts
	ignoreWarnings: [
		{
			module: /eslint/,
		},
		/eval/,
	],
}]);
