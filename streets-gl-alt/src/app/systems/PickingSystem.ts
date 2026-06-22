import Vec2 from "~/lib/math/Vec2";
import Tile from "../objects/Tile";
import System from "../System";
import CursorStyleSystem from "./CursorStyleSystem";
import TileSystem from "./TileSystem";
import UISystem from "./UISystem";
import TileObjectsSystem from "./TileObjectsSystem";
import TileBuilding from "../world/TileBuilding";

export default class PickingSystem extends System {
	private enablePicking: boolean = true;
	private hoveredObjectId: number = 0;
	private selectedObjectId: number = 0;
	private pointerDownPosition: Vec2 = new Vec2();
	public selectedTileBuilding: TileBuilding = null;
	public pointerPosition: Vec2 = new Vec2();
	private canvas: HTMLCanvasElement;
	// Authoritative registry of external-object picking ids (G-buffer object id -> external id).
	// External objects are added by ExternalObjectBridge with ids from a high reserved range; we
	// check this registry before attempting the native tile/building decode so external selection
	// never collides with or crashes the building picking path.
	private externalPickingIds: Map<number, string> = new Map();
	public selectedExternalObjectId: string = null;
	public onExternalObjectSelected: ((externalId: string | null) => void) | null = null;

	public constructor() {
		super();
	}

	public postInit(): void {
		// Get canvas element from systemManager or fall back to document.getElementById
		this.canvas = <HTMLCanvasElement>(this.systemManager.getCanvas() || document.getElementById('canvas'));
		
		if (!this.canvas) {
			console.error('[PickingSystem] Cannot find canvas element');
			return;
		}

		this.canvas.addEventListener('pointerdown', e => {
			if (e.button !== 0) {
				return;
			}

			this.updatePointerPositionFromEvent(e, true);
		});

		this.canvas.addEventListener('pointermove', e => {
			this.updatePointerPositionFromEvent(e);
		});

		this.canvas.addEventListener('pointerup', e => {
			if (e.button !== 0) {
				return;
			}

			this.updatePointerPositionFromEvent(e);

			if (this.pointerDownPosition.x === this.pointerPosition.x && this.pointerDownPosition.y === this.pointerPosition.y) {
				this.onClick();
			}
		});

		this.canvas.addEventListener('mouseenter', e => {
			this.enablePicking = true;
		});

		this.canvas.addEventListener('mouseleave', e => {
			this.enablePicking = false;
		});
	}

	private updatePointerPositionFromEvent(e: PointerEvent, updatePointerDown: boolean = false): void {
		if (document.pointerLockElement !== null) {
			this.pointerPosition.x = Math.floor(window.innerWidth / 2);
			this.pointerPosition.y = Math.floor(window.innerHeight / 2);
		} else {
			this.pointerPosition.x = e.clientX;
			this.pointerPosition.y = e.clientY;
		}

		if (updatePointerDown) {
			this.pointerDownPosition.x = this.pointerPosition.x;
			this.pointerDownPosition.y = this.pointerPosition.y;
		}
	}

	public readObjectId(buffer: Uint32Array): void {
		this.hoveredObjectId = buffer[0];
		this.updatePointer();
	}

	public clearHoveredObjectId(): void {
		this.hoveredObjectId = 0;
		this.updatePointer();
	}

	private updatePointer(): void {
		if (this.hoveredObjectId > 0 && this.enablePicking) {
			this.systemManager.getSystem(CursorStyleSystem).enablePointer();
		} else {
			this.systemManager.getSystem(CursorStyleSystem).disablePointer();
		}
	}

	public registerExternalObject(pickingId: number, externalId: string): void {
		this.externalPickingIds.set(pickingId, externalId);
	}

	public unregisterExternalObject(pickingId: number): void {
		this.externalPickingIds.delete(pickingId);
	}

	private onClick(): void {
		if (this.hoveredObjectId === 0 || this.hoveredObjectId === this.selectedObjectId) {
			this.clearSelection();
			return;
		}

		this.selectedObjectId = this.hoveredObjectId;

		// External object selection: authoritative registry check before the native decode path.
		const externalId = this.externalPickingIds.get(this.selectedObjectId);
		if (externalId !== undefined) {
			this.clearNativeSelection();
			this.selectedExternalObjectId = externalId;
			if (this.onExternalObjectSelected) {
				this.onExternalObjectSelected(externalId);
			}
			return;
		}

		const selectedValue = this.selectedObjectId - 1;

		const localTileId = selectedValue >> 16;
		const tile = this.systemManager.getSystem(TileSystem).getTileByLocalId(localTileId);

		// Defensive: an id that decodes to a tile we don't have loaded isn't selectable.
		if (!tile) {
			this.clearSelection();
			return;
		}

		const localFeatureId = selectedValue & 0xffff;
		const packedFeatureId = tile.buildingLocalToPackedMap.get(localFeatureId);

		const [type, id] = Tile.unpackFeatureId(packedFeatureId);

		const tileObjectsSystem = this.systemManager.getSystem(TileObjectsSystem);
		this.selectedTileBuilding = tileObjectsSystem.getTileBuildingByPackedId(packedFeatureId);

		this.systemManager.getSystem(UISystem).setActiveFeature(type, id);
	}

	private clearNativeSelection(): void {
		this.selectedTileBuilding = null;
		this.systemManager.getSystem(UISystem).clearActiveFeature();
	}

	public clearSelection(): void {
		this.selectedObjectId = 0;
		this.selectedTileBuilding = null;
		const hadExternal = this.selectedExternalObjectId !== null;
		this.selectedExternalObjectId = null;
		this.systemManager.getSystem(UISystem).clearActiveFeature();
		if (hadExternal && this.onExternalObjectSelected) {
			this.onExternalObjectSelected(null);
		}
	}

	public update(deltaTime: number): void {

	}
}