// Earth surface: Blue Marble day colour, Natural Earth water mask, ETOPO relief, ocean glint,
// cloud shadows and Black Marble night lights. Lighting in linear space; tone mapping by Three.js chunks.
in vec3 vObject;
in vec3 vWorld;

uniform sampler2D uDay;
uniform sampler2D uSurface;
uniform sampler2D uAtmos;
uniform vec3 uSunDir;        // Earth-fixed unit vector toward the sun
uniform vec3 uSunColor;
uniform float uSlopeMax;
uniform float uRelief;       // terrain slope exaggeration (0 disables)
uniform float uOcean;        // 0..1 ocean specular/fresnel strength
uniform float uNightLights;  // 0..1
uniform float uClouds;       // 0..1 (shadows follow cloud visibility)
uniform float uCloudShadow;
uniform float uCloudOffset;  // cloud longitude drift in UV units
uniform vec2 uCloudRange;    // coverage remap (low, high)
uniform float uCloudHeight;  // shell height above the surface, Earth radii
uniform float uExposure;

#include <common_earth>

float cloudCover(float raw) {
  return smoothstep(uCloudRange.x, uCloudRange.y, raw);
}

// GGX / Trowbridge-Reitz distribution for the sun glint.
float ggx(float nh, float roughness) {
  float a2 = roughness * roughness * roughness * roughness;
  float d = nh * nh * (a2 - 1.0) + 1.0;
  return a2 / (PI * d * d);
}

void main() {
  vec3 n = geodeticNormal(vObject);
  UvGrad g = uvGrad(normalToUv(n));
  vec3 day = sampleEquirect(uDay, g, 0.0).rgb;
  vec4 surface = sampleEquirect(uSurface, g, 0.0);
  vec4 atmos = sampleEquirect(uAtmos, g, 0.0);
  float water = smoothstep(0.35, 0.65, surface.r);

  vec3 east, north;
  tangentFrame(n, east, north);
  vec2 e = surface.gb * 2.0 - 1.0;
  vec2 slope = sign(e) * e * e * uSlopeMax;
  float polarFade = smoothstep(0.0, 0.08, length(vec2(n.x, n.z)));
  vec3 nt = normalize(n - (slope.x * east + slope.y * north) * uRelief * (1.0 - water) * polarFade);

  vec3 v = normalize(cameraPosition - vWorld);
  vec3 l = uSunDir;
  float geoNL = dot(n, l);
  float nl = max(dot(nt, l), 0.0);
  // Soft terminator: the atmosphere keeps a little light past the geometric shadow line.
  float daylight = smoothstep(-0.10, 0.12, geoNL);
  vec3 twilight = mix(vec3(1.0, 0.45, 0.2), vec3(1.0), smoothstep(0.0, 0.35, geoNL));

  // Cloud shadow: find the cloud above this point along the sun ray.
  vec3 shadowPoint = normalize(n + l * (uCloudHeight / max(geoNL, 0.2)));
  UvGrad sg = uvGrad(normalToUv(shadowPoint));
  float shadowCloud = cloudCover(sampleEquirect(uAtmos, sg, uCloudOffset).r);
  float shadow = 1.0 - uCloudShadow * uClouds * shadowCloud;

  // Land: Blue Marble is already a reflectance-like composite; light it with relief normals.
  vec3 albedo = pow(day, vec3(1.12)) * 1.05; // gentle contrast, keeps natural hues
  vec3 land = albedo * (nl * daylight * shadow) * uSunColor * twilight;

  // Ocean: Blue Marble ocean colour, sky-tinted Fresnel, GGX sun glint (no glint under clouds).
  vec3 h = normalize(l + v);
  float nv = max(dot(n, v), 0.0);
  float fresnel = 0.02 + 0.98 * pow(1.0 - nv, 5.0);
  vec3 oceanBase = albedo * 0.8 * (max(geoNL, 0.0) * daylight * shadow) * uSunColor * twilight;
  // Microfacet glint: D * F(v.h) / (4 n.v) (geometry term ~1 for a calm sea at globe scale).
  float fresnelH = 0.02 + 0.98 * pow(1.0 - max(dot(v, h), 0.0), 5.0);
  float glint = ggx(max(dot(n, h), 0.0), 0.42) * fresnelH / (4.0 * max(nv, 0.15)) * step(0.0, geoNL);
  vec3 sky = vec3(0.30, 0.52, 0.95) * daylight;
  vec3 ocean = oceanBase + uOcean * (glint * 0.45 * shadow * uSunColor * twilight + fresnel * sky * 0.10);

  vec3 color = mix(land, ocean, water);
  color += albedo * 0.012; // faint earthshine/ambient so the night side is not pure black

  // Night lights: warm sodium/LED mix, hidden by day and dimmed under clouds.
  float clouds = uClouds * cloudCover(sampleEquirect(uAtmos, g, uCloudOffset).r);
  float lights = pow(atmos.g, 1.8) * (1.0 - smoothstep(-0.18, 0.02, geoNL)) * (1.0 - 0.75 * clouds);
  color += uNightLights * lights * vec3(1.0, 0.72, 0.42) * 2.2;

  gl_FragColor = vec4(color * uExposure, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
