/**
 * Turf Micro-bundle para PWA Ushuaia
 * Implementa únicamente: point, booleanPointInPolygon, distance, pointOnFeature
 */
window.turf = {
  point: function(coords) {
    return { type: 'Feature', geometry: { type: 'Point', coordinates: coords }, properties: {} };
  },

  // Ray-casting algorithm para GeoJSON Polygons y MultiPolygons
  booleanPointInPolygon: function(pointFeature, polygonFeature) {
    const pt = pointFeature.geometry ? pointFeature.geometry.coordinates : pointFeature;
    const geom = polygonFeature.geometry || polygonFeature;
    const x = pt[0], y = pt[1];

    function pointInRing(pX, pY, ring) {
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0], yi = ring[i][1];
        const xj = ring[j][0], yj = ring[j][1];
        const intersect = ((yi > pY) !== (yj > pY)) && (pX < (xj - xi) * (pY - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
      }
      return inside;
    }

    if (geom.type === 'Polygon') {
      const rings = geom.coordinates;
      if (!pointInRing(x, y, rings[0])) return false;
      for (let i = 1; i < rings.length; i++) {
        if (pointInRing(x, y, rings[i])) return false; // Hueco interior
      }
      return true;
    } else if (geom.type === 'MultiPolygon') {
      for (const poly of geom.coordinates) {
        if (pointInRing(x, y, poly[0])) {
          let inHole = false;
          for (let i = 1; i < poly.length; i++) {
            if (pointInRing(x, y, poly[i])) { inHole = true; break; }
          }
          if (!inHole) return true;
        }
      }
      return false;
    }
    return false;
  },

  // Fórmula de Haversine para distancia en kilómetros
  distance: function(from, to, options) {
    const p1 = from.geometry ? from.geometry.coordinates : from;
    const p2 = to.geometry ? to.geometry.coordinates : to;
    const R = 6371; // Radio medio de la Tierra en km
    const dLat = (p2[1] - p1[1]) * Math.PI / 180;
    const dLon = (p2[0] - p1[0]) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(p1[1] * Math.PI / 180) * Math.cos(p2[1] * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  },

  pointOnFeature: function(feature) {
    const geom = feature.geometry || feature;
    let coords = [0, 0];
    if (geom.type === 'Polygon' && geom.coordinates[0]?.length) {
      coords = geom.coordinates[0][0];
    } else if (geom.type === 'MultiPolygon' && geom.coordinates[0]?.[0]?.length) {
      coords = geom.coordinates[0][0][0];
    }
    return { type: 'Feature', geometry: { type: 'Point', coordinates: coords } };
  }
};