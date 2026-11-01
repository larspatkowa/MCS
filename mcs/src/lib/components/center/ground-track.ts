const EARTH_RADIUS_M = 6_371_008.8;
const rad = (degrees: number) => (degrees * Math.PI) / 180;

/** Great-circle distance in meters (haversine). */
export function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
	const dLat = rad(lat2 - lat1);
	const dLon = rad(lon2 - lon1);
	const a =
		Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
	return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Initial bearing from the first point to the second, in degrees from true north. */
export function bearingDegrees(lat1: number, lon1: number, lat2: number, lon2: number): number {
	const y = Math.sin(rad(lon2 - lon1)) * Math.cos(rad(lat2));
	const x =
		Math.cos(rad(lat1)) * Math.sin(rad(lat2)) -
		Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lon2 - lon1));
	return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** A 1/2/5 × 10^n ring spacing that draws two to five rings inside the extent. */
export function niceRingStep(extentMeters: number): number {
	const rough = extentMeters / 3;
	const magnitude = 10 ** Math.floor(Math.log10(rough));
	for (const factor of [1, 2, 5, 10]) {
		if (factor * magnitude >= rough) return factor * magnitude;
	}
	return 10 * magnitude;
}
