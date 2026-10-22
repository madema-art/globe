// Independent cloud shell (NASA Blue Marble cloud composite), drifting in longitude.
in vec3 vObject;
in vec3 vWorld;

uniform sampler2D uAtmos;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uClouds;       // overall opacity 0..1
uniform float uCloudOffset;
uniform vec2 uCloudRange;
uniform float uExposure;

#include <common_earth>

void main() {
  vec3 n = geodeticNormal(vObject);
  UvGrad g = uvGrad(normalToUv(n));
  float raw = sampleEquirect(uAtmos, g, uCloudOffset).r;
  float cover = smoothstep(uCloudRange.x, uCloudRange.y, raw);

  vec3 v = normalize(cameraPosition - vWorld);
  float geoNL = dot(n, uSunDir);
  float daylight = smoothstep(-0.12, 0.15, geoNL);
  vec3 twilight = mix(vec3(1.0, 0.5, 0.28), vec3(1.0), smoothstep(0.0, 0.3, geoNL));
  // Wrapped diffuse: thick clouds scatter light well beyond the sub-solar point.
  float diffuse = clamp(geoNL * 0.75 + 0.25, 0.0, 1.0) * daylight;
  vec3 color = vec3(0.98, 0.98, 1.0) * diffuse * uSunColor * twilight;
  color += vec3(0.010, 0.012, 0.018); // night-side clouds stay barely visible

  // Clouds look denser near the limb (longer path) and slightly blue from the air in front of them.
  float nv = max(dot(n, v), 0.0);
  float alpha = cover * uClouds * mix(1.0, 0.75, nv);
  color = mix(color, color * vec3(0.82, 0.9, 1.0), pow(1.0 - nv, 3.0));

  gl_FragColor = vec4(color * uExposure, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
