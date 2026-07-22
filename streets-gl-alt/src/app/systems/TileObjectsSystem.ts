import TileSystem from "./TileSystem";
import Tile from "../objects/Tile";
import TileBuilding from "../world/TileBuilding";
import System from "../System";

/**
 * Tracks TileBuilding instances across overlapping tiles, plus a user-hide set
 * that survives tile reload / holder switches (display-buffer patches reset on reload).
 */
export default class TileObjectsSystem extends System {
	private buildingsList: Map<number, TileBuilding> = new Map();
	private activeTiles: Set<Tile> = new Set();
	/** Packed feature IDs the parent app asked to keep hidden. */
	private userHiddenBuildings: Set<number> = new Set();

	public postInit(): void {

	}

	public addTile(tile: Tile): void {
		this.activeTiles.add(tile);

		for (const packedId of tile.buildingOffsetMap.keys()) {
			const object = this.buildingsList.get(packedId);

			if (object) {
				object.addParent(tile);
			} else {
				const building = new TileBuilding(packedId);
				building.addParent(tile);
				this.buildingsList.set(packedId, building);
			}

			if (this.userHiddenBuildings.has(packedId)) {
				this.applyUserHide(packedId);
			}
		}
	}

	public removeTile(tile: Tile): void {
		this.activeTiles.delete(tile);

		if (!tile.buildingOffsetMap) {
			return;
		}

		for (const packedId of tile.buildingOffsetMap.keys()) {
			const object = this.buildingsList.get(packedId);

			if (object) {
				object.removeParent(tile);
				// removeParent may showBuilding() on the new holder for dedup — re-apply user hide.
				if (this.userHiddenBuildings.has(packedId)) {
					this.applyUserHide(packedId);
				}
			}
		}
	}

	public getTileBuildingByPackedId(id: number): TileBuilding {
		return this.buildingsList.get(id);
	}

	public isUserHidden(packedId: number): boolean {
		return this.userHiddenBuildings.has(packedId);
	}

	public getUserHiddenBuildingIds(): number[] {
		return Array.from(this.userHiddenBuildings);
	}

	/**
	 * Hide a building for the user. Remembers the id so it stays hidden after tile reloads.
	 * Returns whether the building is currently loaded in any tile.
	 */
	public hideUserBuilding(packedId: number): boolean {
		this.userHiddenBuildings.add(packedId);
		return this.applyUserHide(packedId);
	}

	/**
	 * Show a previously user-hidden building (restores holder visibility; keeps dedup hides).
	 */
	public showUserBuilding(packedId: number): boolean {
		this.userHiddenBuildings.delete(packedId);
		const building = this.buildingsList.get(packedId);
		if (!building?.holder) {
			return false;
		}

		if (!building.holder.isBuildingVisible(packedId)) {
			building.holder.showBuilding(packedId);
		}

		// Keep non-holder parents hidden (overlap dedup).
		for (const parent of building.parents) {
			if (parent !== building.holder && parent.isBuildingVisible(packedId)) {
				parent.hideBuilding(packedId);
			}
		}

		return true;
	}

	/** Replace the entire user-hidden set (used when parent syncs project/session state). */
	public syncUserHiddenBuildings(packedIds: number[]): void {
		const next = new Set(
			(packedIds || []).filter((id) => typeof id === 'number' && Number.isFinite(id))
		);

		for (const id of Array.from(this.userHiddenBuildings)) {
			if (!next.has(id)) {
				this.showUserBuilding(id);
			}
		}

		for (const id of next) {
			this.hideUserBuilding(id);
		}
	}

	private applyUserHide(packedId: number): boolean {
		const building = this.buildingsList.get(packedId);
		if (!building) {
			return false;
		}

		let applied = false;
		for (const parent of building.parents) {
			if (parent.isBuildingVisible(packedId)) {
				parent.hideBuilding(packedId);
				applied = true;
			} else if (parent.buildingOffsetMap.has(packedId)) {
				// Already hidden on this tile — still counts as applied.
				applied = true;
			}
		}

		return applied || building.parents.length > 0;
	}

	public update(deltaTime: number): void {
		for (const tile of this.systemManager.getSystem(TileSystem).tiles.values()) {
			if (tile.extrudedMesh && !this.activeTiles.has(tile)) {
				this.addTile(tile);
			}
		}
	}
}