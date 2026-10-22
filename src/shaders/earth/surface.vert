// Shared by the Earth surface and cloud shell. Passes Earth-fixed (object) and world positions.
out vec3 vObject;
out vec3 vWorld;

void main() {
  vObject = position;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
