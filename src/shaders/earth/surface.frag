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
// Strategy map (the physical Earth stays fully visible; only human information is drawn on it).
uniform float uStrategy;       // 0 off, 1 on
uniform sampler2D uTerritory;  // R: owned by the player (equal-angle grid, row 0 = south, bilinear)
uniform vec4 uObservers[4];    // xyz: Earth-fixed unit normal, w: observation radius (radians)
uniform int uObserverCount;

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

// Small value noise so territory edges follow natural, irregular lines instead of the gameplay grid.
float hash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise3(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}

// Territory: a warm wash inside and a thin brass boundary engraved on the ground. Observation: a faint
// ivory circle around each observer marking what is seen right now. Both are lit by the same sun.
vec3 strategyMarks(vec3 color, vec3 n, vec2 uv, float light) {
  // Derivatives must stay in uniform control flow, so the territory field is evaluated everywhere.
  float t = texture(uTerritory, uv).r;
  {
    float wobble = (noise3(n * 1400.0) - 0.5) * 0.22 + (noise3(n * 4200.0) - 0.5) * 0.08;
    float field = t + wobble * smoothstep(0.0, 0.3, t) * smoothstep(1.0, 0.7, t);
    float w = max(fwidth(field), 1e-4);
    float inside = smoothstep(0.5 - w, 0.5 + w, field);
    float line = 1.0 - smoothstep(0.0, 1.4 * w, abs(field - 0.5));
    vec3 brass = vec3(0.62, 0.40, 0.12);
    color = mix(color, color * vec3(1.16, 1.06, 0.84) + brass * 0.015 * light, inside * 0.55);
    color = mix(color, brass * (0.35 + 0.65 * light), line * 0.9);
  }
  for (int i = 0; i < 4; i++) {
    if (i >= uObserverCount) break;
    float d = acos(clamp(dot(n, uObservers[i].xyz), -1.0, 1.0));
    float w = max(fwidth(d), 1e-6);
    float ring = 1.0 - smoothstep(0.0, 1.2 * w, abs(d - uObservers[i].w));
    float inner = 1.0 - smoothstep(uObservers[i].w - 6.0 * w, uObservers[i].w, d);
    color = mix(color, color * 1.06, inner * 0.5);
    color = mix(color, vec3(0.86, 0.82, 0.70) * (0.3 + 0.7 * light), ring * 0.45);
  }
  return color;
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

  if (uStrategy > 0.5) color = strategyMarks(color, n, g.uv, max(daylight, 0.25));

  gl_FragColor = vec4(color * uExposure, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
