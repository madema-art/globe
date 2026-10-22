// Shared Earth shader helpers. Earth-fixed frame: +X = (0N, 0E), +Y = north pole, +Z = (0N, 90W).
#define PI 3.141592653589793
#define TWO_PI 6.283185307179586

uniform float uPolarRatio; // WGS84 b / a

// Geodetic "up" (ellipsoid normal) for an Earth-fixed point on an ellipsoid with radii (1, uPolarRatio, 1).
vec3 geodeticNormal(vec3 p) {
  return normalize(vec3(p.x, p.y / (uPolarRatio * uPolarRatio), p.z));
}

// Equirectangular UV: u = (lon + 180) / 360, v = (lat + 90) / 180 (v = 1 at the north edge).
vec2 normalToUv(vec3 n) {
  float lon = atan(-n.z, n.x);
  float lat = asin(clamp(n.y, -1.0, 1.0));
  return vec2(lon / TWO_PI + 0.5, lat / PI + 0.5);
}

// Seam-free equirectangular sampling: per-fragment UVs jump from 1 to 0 at the antimeridian, which would make
// screen-space derivatives (and therefore mip selection) explode into a visible line. Use derivatives of a
// second parameterisation whose discontinuity lies on the prime meridian and take whichever is smaller.
struct UvGrad { vec2 uv; vec2 dx; vec2 dy; };

UvGrad uvGrad(vec2 uv) {
  vec2 alt = vec2(fract(uv.x + 0.5), uv.y);
  vec2 dx = dFdx(uv), dy = dFdy(uv);
  vec2 dxa = dFdx(alt), dya = dFdy(alt);
  if (abs(dxa.x) + abs(dya.x) < abs(dx.x) + abs(dy.x)) { dx.x = dxa.x; dy.x = dya.x; }
  return UvGrad(uv, dx, dy);
}

vec4 sampleEquirect(sampler2D map, UvGrad g, float uOffset) {
  return textureGrad(map, vec2(g.uv.x + uOffset, g.uv.y), g.dx, g.dy);
}

// East / north unit tangents for a geodetic normal (degenerate exactly at the poles; callers fade relief there).
void tangentFrame(vec3 n, out vec3 east, out vec3 north) {
  vec3 e = vec3(n.z, 0.0, -n.x); // = cos(lat) * (-sin lon, 0, -cos lon)
  float len = length(e);
  east = len > 1e-5 ? e / len : vec3(0.0, 0.0, -1.0);
  north = cross(n, east);
}
