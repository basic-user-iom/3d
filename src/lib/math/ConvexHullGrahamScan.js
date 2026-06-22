/**
 * Graham's Scan Convex Hull Algorithm
 * @desc An implementation of the Graham's Scan Convex Hull algorithm in JavaScript.
 * @author Brian Barnett, brian@3kb.co.uk, http://brianbar.net/ || http://3kb.co.uk/
 * @version 1.0.5
 */
function ConvexHullGrahamScan() {
	this.anchorPoint = undefined;
	this.reverse = false;
	this.points = [];
}

ConvexHullGrahamScan.prototype = {

	constructor: ConvexHullGrahamScan,

	Point: function (x, y) {
		this.x = x;
		this.y = y;
	},

	_findPolarAngle: function (a, b) {
		var ONE_RADIAN = 57.295779513082;
		var deltaX, deltaY;

		//if the points are undefined, return a zero difference angle.
		if (!a || !b) return 0;

		deltaX = (b.x - a.x);
		deltaY = (b.y - a.y);

		if (deltaX === 0 && deltaY === 0) {
			return 0;
		}

		var angle = Math.atan2(deltaY, deltaX) * ONE_RADIAN;

		if (this.reverse) {
			if (angle <= 0) {
				angle += 360;
			}
		} else {
			if (angle >= 0) {
				angle += 360;
			}
		}

		return angle;
	},

	addPoint: function (x, y) {
		//Check for a new anchor
		var newAnchor =
			(this.anchorPoint === undefined) ||
			(this.anchorPoint.y > y) ||
			(this.anchorPoint.y === y && this.anchorPoint.x > x);

		if (newAnchor) {
			if (this.anchorPoint !== undefined) {
				this.points.push(new this.Point(this.anchorPoint.x, this.anchorPoint.y));
			}
			this.anchorPoint = new this.Point(x, y);
		} else {
			this.points.push(new this.Point(x, y));
		}
	},

	_sortPoints: function () {
		var self = this;

		return this.points.sort(function (a, b) {
			var polarA = self._findPolarAngle(self.anchorPoint, a);
			var polarB = self._findPolarAngle(self.anchorPoint, b);

			if (polarA < polarB) {
				return -1;
			}
			if (polarA > polarB) {
				return 1;
			}

			return 0;
		});
	},

	_checkPoints: function (p0, p1, p2) {
		var difAngle;
		var cwAngle = this._findPolarAngle(p0, p1);
		var ccwAngle = this._findPolarAngle(p0, p2);

		if (cwAngle > ccwAngle) {

			difAngle = cwAngle - ccwAngle;

			return !(difAngle > 180);

		} else if (cwAngle < ccwAngle) {

			difAngle = ccwAngle - cwAngle;

			return (difAngle > 180);

		}

		return true;
	},

	getHull: function () {
		var hullPoints = [],
			points,
			pointsLength;

		this.reverse = this.points.every(function (point) {
			return (point.x < 0 && point.y < 0);
		});

		points = this._sortPoints();
		pointsLength = points.length;

		//If there are less than 3 points, joining these points creates a correct hull.
		if (pointsLength < 3) {
			points.unshift(this.anchorPoint);
			return points;
		}

		//move first two points to output array
		hullPoints.push(points.shift(), points.shift());

		//scan is repeated until no concave points are present.
		// SAFETY: Add iteration counter to prevent infinite loops
		var maxIterations = pointsLength * pointsLength; // Reasonable upper bound
		var iterations = 0;
		
		while (true) {
			// SAFETY: Prevent infinite loops that could freeze the UI
			iterations++;
			if (iterations > maxIterations) {
				console.error('[ConvexHullGrahamScan] Infinite loop detected, breaking after', iterations, 'iterations');
				// Return best result so far
				var ap = this.anchorPoint;
				hullPoints = hullPoints.filter(function (p) {
					return !!p;
				});
				if (!hullPoints.some(function (p) {
					return (p.x === ap.x && p.y === ap.y);
				})) {
					hullPoints.unshift(this.anchorPoint);
				}
				return hullPoints;
			}
			
			var p0,
				p1,
				p2;

			// SAFETY: Check if we have points to process
			if (points.length === 0 && hullPoints.length < 3) {
				// Not enough points, return what we have
				var ap = this.anchorPoint;
				hullPoints = hullPoints.filter(function (p) {
					return !!p;
				});
				if (!hullPoints.some(function (p) {
					return (p.x === ap.x && p.y === ap.y);
				})) {
					hullPoints.unshift(this.anchorPoint);
				}
				return hullPoints;
			}

			hullPoints.push(points.shift());

			p0 = hullPoints[hullPoints.length - 3];
			p1 = hullPoints[hullPoints.length - 2];
			p2 = hullPoints[hullPoints.length - 1];

			if (this._checkPoints(p0, p1, p2)) {
				hullPoints.splice(hullPoints.length - 2, 1);
			}

			if (points.length === 0) {
				if (pointsLength === hullPoints.length) {
					//check for duplicate anchorPoint edge-case, if not found, add the anchorpoint as the first item.
					var ap = this.anchorPoint;
					//remove any udefined elements in the hullPoints array.
					hullPoints = hullPoints.filter(function (p) {
						return !!p;
					});
					if (!hullPoints.some(function (p) {
						return (p.x === ap.x && p.y === ap.y);
					})) {
						hullPoints.unshift(this.anchorPoint);
					}
					return hullPoints;
				}
				points = hullPoints;
				pointsLength = points.length;
				hullPoints = [];
				hullPoints.push(points.shift(), points.shift());
			}
		}
	}
};

export default ConvexHullGrahamScan;
