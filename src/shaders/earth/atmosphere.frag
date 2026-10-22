// Single-scattering atmosphere (Rayleigh + Mie) ray-marched through a thin spherical shell.
// Rendered on the shell's back faces with additive blending, so it covers both the limb halo and the disc.
// Units: Earth equatorial radii. Thickness and scale heights are mildly exaggerated for legibility at
// globe scale; scattering coefficients are scaled so the column optical depth stays Earth-like.
#define PI 3.141592653589793
in vec3 vWorld;

uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uPlanetRadius;
uniform float uAtmosphereRadius;
uniform float uIntensity;
uniform float uExposure;

const int VIEW_STEPS = 12;
const int LIGHT_STEPS = 4;
const float H_R = 0.0042;                       // Rayleigh scale height
const float H_M = 0.0016;                       // Mie scale height
const vec3 BETA_R = vec3(11.0, 25.5, 62.0);     // per Earth radius at sea level
const float BETA_M = 9.0;
const float MIE_G = 0.76;

vec2 raySphere(vec3 ro, vec3 rd, float r) {
  float b = dot(ro, rd);
  float c = dot(ro, ro) - r * r;
  float h = b * b - c;
  if (h < 0.0) return vec2(1e9, -1e9);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}

void main() {
  vec3 ro = cameraPosition;
  vec3 rd = normalize(vWorld - ro);
  vec2 atm = raySphere(ro, rd, uAtmosphereRadius);
  vec2 planet = raySphere(ro, rd, uPlanetRadius);
  float t0 = max(atm.x, 0.0);
  float t1 = atm.y;
  if (planet.x > 0.0) t1 = min(t1, planet.x);
  if (t1 <= t0) discard;

  float ds = (t1 - t0) / float(VIEW_STEPS);
  vec3 sumR = vec3(0.0), sumM = vec3(0.0);
  float odR = 0.0, odM = 0.0;
  for (int i = 0; i < VIEW_STEPS; i++) {
    vec3 p = ro + rd * (t0 + ds * (float(i) + 0.5));
    float h = length(p) - uPlanetRadius;
    float dR = exp(-h / H_R) * ds;
    float dM = exp(-h / H_M) * ds;
    odR += dR;
    odM += dM;
    // Light ray toward the sun; points in the planet's shadow receive nothing.
    vec2 lp = raySphere(p, uSunDir, uPlanetRadius);
    if (lp.x > 0.0) continue;
    float lt = raySphere(p, uSunDir, uAtmosphereRadius).y;
    float ls = lt / float(LIGHT_STEPS);
    float lR = 0.0, lM = 0.0;
    for (int j = 0; j < LIGHT_STEPS; j++) {
      float lh = length(p + uSunDir * ls * (float(j) + 0.5)) - uPlanetRadius;
      lR += exp(-lh / H_R) * ls;
      lM += exp(-lh / H_M) * ls;
    }
    vec3 tau = BETA_R * (odR + lR) + BETA_M * 1.1 * (odM + lM);
    vec3 attenuation = exp(-tau);
    sumR += dR * attenuation;
    sumM += dM * attenuation;
  }
  float mu = dot(rd, uSunDir);
  float phaseR = 3.0 / (16.0 * PI) * (1.0 + mu * mu);
  float g2 = MIE_G * MIE_G;
  float phaseM = 3.0 / (8.0 * PI) * ((1.0 - g2) * (1.0 + mu * mu)) / ((2.0 + g2) * pow(1.0 + g2 - 2.0 * MIE_G * mu, 1.5));
  vec3 color = (sumR * BETA_R * phaseR + sumM * BETA_M * phaseM) * uSunColor * uIntensity;

  gl_FragColor = vec4(color * uExposure, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
