import RenderSystem from "./systems/RenderSystem";
import TileSystem from "./systems/TileSystem";
import ControlsSystem from "./systems/ControlsSystem";
import PickingSystem from "./systems/PickingSystem";
import CursorStyleSystem from './systems/CursorStyleSystem';
import SystemManager from "./SystemManager";
import TileObjectsSystem from "./systems/TileObjectsSystem";
import TileLoadingSystem from "./systems/TileLoadingSystem";
import MapWorkerSystem from "./systems/MapWorkerSystem";
import MapTimeSystem from "./systems/MapTimeSystem";
import UISystem from "./systems/UISystem";
import SceneSystem from './systems/SceneSystem';
import ResourceLoader, {ResourceJSON} from './world/ResourceLoader';
import resourcesList from '../resources/resources.json';
import VehicleSystem from "./systems/VehicleSystem";
import TerrainSystem from "./systems/TerrainSystem";
import SettingsSystem from "~/app/systems/SettingsSystem";
import SlippyMapSystem from "~/app/systems/SlippyMapSystem";
import { ExternalObjectBridge } from "./ExternalObjectBridge";

class App {
	private loop = (deltaTime: number): void => this.update(deltaTime);
	private time = 0;
	private systemManager: SystemManager;
	private canvasElement?: HTMLCanvasElement;
	private uiElement?: HTMLElement;

	/**
	 * Initialize Streets GL App
	 * @param canvas Optional canvas element. If not provided, will look for #canvas
	 * @param ui Optional UI container element. If not provided, will look for #ui
	 */
	public constructor(canvas?: HTMLCanvasElement, ui?: HTMLElement) {
		this.canvasElement = canvas;
		this.uiElement = ui;
		this.init();
	}

	private init(): void {
		// Filter out CORS errors from tiles.streets.gl (they're expected and don't break functionality)
		this.filterConsoleErrors();
		
		this.systemManager = new SystemManager();
		
		// Store canvas and UI elements in SystemManager for systems to access
		if (this.canvasElement) {
			this.systemManager.canvasElement = this.canvasElement;
		}
		if (this.uiElement) {
			this.systemManager.uiElement = this.uiElement;
		}

		this.systemManager.addSystems(SettingsSystem);
		this.systemManager.addSystems(UISystem);

		ResourceLoader.addFromJSON(resourcesList as ResourceJSON);
		ResourceLoader.load({
			onFileLoad: (loaded: number, total: number) => {
				this.systemManager.getSystem(UISystem).setResourcesLoadingProgress(loaded / total);
			},
			onLoadedFileNameChange: (name: string) => {
				this.systemManager.getSystem(UISystem).setResourceInProgressPath(name);
			}
		}).then(() => {
			this.systemManager.addSystems(
				ControlsSystem,
				MapTimeSystem,
				TerrainSystem,
				TileSystem,
				SceneSystem,
				CursorStyleSystem,
				PickingSystem,
				TileObjectsSystem,
				SlippyMapSystem,
				VehicleSystem,
				RenderSystem,
				MapWorkerSystem,
				TileLoadingSystem,
			);
			
			// Initialize external object bridge for parent window communication
			new ExternalObjectBridge(this.systemManager);
		});

		this.update();
	}

	private filterConsoleErrors(): void {
		const originalError = console.error;
		const originalWarn = console.warn;
		const originalLog = console.log;
		
		const shouldFilter = (message: string): boolean => {
			// Filter out CORS errors from Streets GL tile server
			if (message.includes('Access to fetch') && 
				message.includes('tiles.streets.gl') && 
				message.includes('CORS policy')) {
				return true;
			}
			// Filter out 404/500 errors from Streets GL tile server
			if ((message.includes('Failed to load resource') || message.includes('GET')) && 
				message.includes('tiles.streets.gl') && 
				(message.includes('404') || message.includes('500') || message.includes('ERR_FAILED'))) {
				return true;
			}
			// Filter out tile provider warnings for CORS-related failures
			if ((message.includes('[WaterTileSource]') || 
				 message.includes('[PBFVectorFeatureProvider]') ||
				 message.includes('[MapboxVectorFeatureProvider]')) && 
				(message.includes('Failed to fetch') || 
				 message.includes('status 500') || 
				 message.includes('status 404') ||
				 message.includes('Failed to fetch tile'))) {
				return true;
			}
			return false;
		};
		
		const filteredError = (...args: any[]): void => {
			const message = args[0]?.toString() || '';
			if (shouldFilter(message)) {
				return;
			}
			originalError.apply(console, args);
		};
		
		const filteredWarn = (...args: any[]): void => {
			const message = args[0]?.toString() || '';
			if (shouldFilter(message)) {
				return;
			}
			originalWarn.apply(console, args);
		};
		
		const filteredLog = (...args: any[]): void => {
			const message = args[0]?.toString() || '';
			if (shouldFilter(message)) {
				return;
			}
			originalLog.apply(console, args);
		};
		
		// Override console methods
		console.error = filteredError;
		console.warn = filteredWarn;
		console.log = filteredLog;
	}

	private update(rafTime = 0): void {
		requestAnimationFrame(this.loop);

		const frameStart = performance.now();
		const deltaTime = (rafTime - this.time) / 1e3;
		this.time = rafTime;

		this.systemManager.updateSystems(deltaTime);

		const frameTime = performance.now() - frameStart;
		this.systemManager.getSystem(UISystem).updateFrameTime(frameTime);
	}
}

// Export singleton for standalone use, and class for direct integration
const defaultApp = new App();
export default defaultApp;
export { App };
