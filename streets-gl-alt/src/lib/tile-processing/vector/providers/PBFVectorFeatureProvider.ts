import VectorFeatureCollection from "~/lib/tile-processing/vector/features/VectorFeatureCollection";
import Pbf from 'pbf';
import {FeatureProvider} from "~/lib/tile-processing/types";
import PBFTile from "~/lib/tile-processing/vector/providers/pbf/PBFTile";
import PBFTileDecoder, {TagTypes, TagTypesMap} from "~/lib/tile-processing/vector/providers/pbf/PBFTileDecoder";
import {VectorTile} from "~/lib/tile-processing/vector/providers/pbf/VectorTile";
import VectorTileHandler from "~/lib/tile-processing/vector/handlers/VectorTileHandler";
import VectorTilePolygonHandler from "~/lib/tile-processing/vector/handlers/VectorTilePolygonHandler";
import VectorTileLineStringHandler from "~/lib/tile-processing/vector/handlers/VectorTileLineStringHandler";
import VectorTilePointHandler from "~/lib/tile-processing/vector/handlers/VectorTilePointHandler";
import {VectorFeature} from "~/lib/tile-processing/vector/features/VectorFeature";
import {getCollectionFromVectorFeatures} from "~/lib/tile-processing/vector/utils";
import Utils from "~/app/Utils";
import Config from "~/app/Config";

const proto = require('./pbf/vector_tile.js').Tile;

const PBFTagTypesMap: TagTypesMap = {
	"@ombb00": TagTypes.Double,
	"@ombb01": TagTypes.Double,
	"@ombb10": TagTypes.Double,
	"@ombb11": TagTypes.Double,
	"@ombb20": TagTypes.Double,
	"@ombb21": TagTypes.Double,
	"@ombb30": TagTypes.Double,
	"@ombb31": TagTypes.Double,
	"@poiX": TagTypes.Double,
	"@poiY": TagTypes.Double,
	"@poiR": TagTypes.Double,
	type: TagTypes.String,
	osmId: TagTypes.SInt,
	osmType: TagTypes.SInt,
	name: TagTypes.String,
	width: TagTypes.Double,
	height: TagTypes.Double,
	minHeight: TagTypes.Double,
	roofHeight: TagTypes.Double,
	buildingType: TagTypes.String,
	wallType: TagTypes.String,
	pathType: TagTypes.String,
	cyclewaySide: TagTypes.SInt,
	sidewalkSide: TagTypes.SInt,
	surface: TagTypes.String,
	lanes: TagTypes.SInt,
	lanesForward: TagTypes.SInt,
	lanesBackward: TagTypes.SInt,
	oneway: TagTypes.Bool,
	levels: TagTypes.SInt,
	minLevel: TagTypes.SInt,
	roofLevels: TagTypes.SInt,
	roofShape: TagTypes.String,
	windows: TagTypes.Bool,
	defaultRoof: TagTypes.Bool,
	color: TagTypes.SInt,
	material: TagTypes.String,
	roofMaterial: TagTypes.String,
	roofColor: TagTypes.SInt,
	roofType: TagTypes.String,
	roofAngle: TagTypes.Double,
	roofOrientation: TagTypes.String,
	roofDirection: TagTypes.Double,
	laneMarkings: TagTypes.String,
	gauge: TagTypes.String,
	fenceType: TagTypes.String,
	leafType: TagTypes.String,
	genus: TagTypes.String,
	direction: TagTypes.Double,
	waterwayType: TagTypes.String,
	sport: TagTypes.String,
	hoops: TagTypes.SInt,
	railwayType: TagTypes.String,
	crop: TagTypes.String,
	country: TagTypes.String,
	wikidata: TagTypes.String,
	isPart: TagTypes.Bool,
	lampSupport: TagTypes.String
} as const;

export default class PBFVectorFeatureProvider implements FeatureProvider<VectorFeatureCollection> {
	public constructor() {
	}

	public async getCollection(
		{
			x,
			y,
			zoom
		}: {
			x: number;
			y: number;
			zoom: number;
		}
	): Promise<VectorFeatureCollection> {
		const vectorTile = await PBFVectorFeatureProvider.fetchTile(x, y, zoom);

		const handlers = PBFVectorFeatureProvider.getVectorTileHandlers(vectorTile);
		const features = PBFVectorFeatureProvider.getFeaturesFromHandlers(handlers);

		return getCollectionFromVectorFeatures(features);
	}

	private static async fetchTile(x: number, y: number, zoom: number): Promise<VectorTile.Tile> {
		const size = 40075016.68 / (1 << zoom);
		const url = PBFVectorFeatureProvider.getTileURL(x, y, zoom);
		
		try {
			const response = await fetch(url, {
				method: 'GET'
			});

			// Log first successful response for debugging
			if (response.status === 200 && !PBFVectorFeatureProvider._successLogged) {
				console.log('[PBFVectorFeatureProvider] ✅ Tile loaded successfully:', { url, status: response.status });
				PBFVectorFeatureProvider._successLogged = true;
			}

			if (response.status === 404) {
				// Tile doesn't exist for this location - return empty tile instead of throwing error
				// This is normal for map tile systems where not all tiles exist
				// Note: Browser will still log 404 in network tab, but we handle it gracefully
				return PBFTileDecoder.decode({ layers: [] } as PBFTile, PBFTagTypesMap, size);
			}

			if (response.status !== 200) {
				// Log first few failures for debugging
				if (!PBFVectorFeatureProvider._errorCount || PBFVectorFeatureProvider._errorCount < 3) {
					console.warn('[PBFVectorFeatureProvider] ⚠️ Tile fetch failed:', { url, status: response.status });
					PBFVectorFeatureProvider._errorCount = (PBFVectorFeatureProvider._errorCount || 0) + 1;
				}
				return PBFTileDecoder.decode({ layers: [] } as PBFTile, PBFTagTypesMap, size);
			}

			const arrayBuffer = await response.arrayBuffer();
			
			const pbf = new Pbf(arrayBuffer);
			const obj = proto.read(pbf) as PBFTile;
			
			const decoded = PBFTileDecoder.decode(obj, PBFTagTypesMap, size);
			
			// Log first successful decode with feature count
			if (!PBFVectorFeatureProvider._decodeLogged) {
				const layerCount = obj.layers?.length || 0;
				const featureCount = decoded.layers?.length || 0;
				console.log('[PBFVectorFeatureProvider] ✅ Tile decoded:', { 
					url, 
					layerCount,
					featureCount,
					hasBuildings: layerCount > 0 && featureCount > 0
				});
				PBFVectorFeatureProvider._decodeLogged = true;
			}

			return decoded;
		} catch (error) {
			// Network errors or other fetch failures - return empty tile
			console.error('[PBFVectorFeatureProvider] Tile fetch error:', { url, error });
			return PBFTileDecoder.decode({ layers: [] } as PBFTile, PBFTagTypesMap, size);
		}
	}

	private static getTileURL(x: number, y: number, zoom: number): string {
		const url = Utils.resolveEndpointTemplate({
			template: Config.TilesEndpointTemplate,
			values: {
				x: x,
				y: y,
				z: zoom
			}
		});
		// Only log first few requests to avoid spam
		if (!PBFVectorFeatureProvider._loggedCount || PBFVectorFeatureProvider._loggedCount < 3) {
			console.log('[PBFVectorFeatureProvider] Fetching tile:', url, { x, y, zoom });
			PBFVectorFeatureProvider._loggedCount = (PBFVectorFeatureProvider._loggedCount || 0) + 1;
		}
		return url;
	}
	
	private static _loggedCount: number = 0;
	private static _successLogged: boolean = false;
	private static _errorCount: number = 0;
	private static _decodeLogged: boolean = false;

	private static getVectorTileHandlers(vectorTile: VectorTile.Tile): VectorTileHandler[] {
		const handlers: VectorTileHandler[] = [];

		for (const layer of vectorTile.layers.values()) {
			for (const feature of layer.features) {
				switch (feature.type) {
					case VectorTile.FeatureType.Polygon: {
						handlers.push(new VectorTilePolygonHandler(feature));
						break;
					}
					case VectorTile.FeatureType.LineString: {
						handlers.push(new VectorTileLineStringHandler(feature));
						break;
					}
					case VectorTile.FeatureType.Point: {
						handlers.push(new VectorTilePointHandler(feature));
						break;
					}
				}
			}
		}

		return handlers;
	}

	private static getFeaturesFromHandlers(handlers: VectorTileHandler[]): VectorFeature[] {
		const features: VectorFeature[] = [];

		for (const handler of handlers) {
			features.push(...handler.getFeatures());
		}

		return features;
	}
}
