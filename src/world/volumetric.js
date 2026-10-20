/* ============================================================================
   volumetric.js — light you can see in the air.

   At half resolution, each pixel walks from the eye toward whatever the depth
   buffer says it hit, in a dozen steps. At every step it asks two questions:
   can the key light (sun, or moon) see this point — the shadow map answers —
   and how close are the lamps? What it gathers is the light scattered toward
   the eye by the air: shafts through the trees, the cabin's window spilling
   into a foggy yard, a halo round every lamp post. How thick the air is comes
   from the palette's fog, the weather and being offline, so a clear noon is
   nearly clean and a foggy night is full of it.
   ========================================================================== */

import { Color, Matrix4, ShaderMaterial, Vector3 } from 'three';

export const MAX_LAMPS = 9;

const VS = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const FS = /* glsl */ `
  precision highp sampler2DShadow;
  uniform sampler2D tDepth;
  uniform sampler2DShadow tShadow;
  uniform mat4 uInvProj;
  uniform mat4 uCamWorld;
  uniform mat4 uShadowMatrix;
  uniform vec3 uCamPos;
  uniform vec3 uKeyDir;      // toward the light
  uniform vec3 uKeyColor;
  uniform float uDensity;
  uniform float uMaxDist;
  uniform int uSteps;
  uniform vec3 uLampPos[${MAX_LAMPS}];
  uniform vec3 uLampColor[${MAX_LAMPS}];
  uniform int uLamps;
  varying vec2 vUv;

  // Interleaved gradient noise: a different start offset per pixel, so a
  // dozen steps read as smooth after the blur instead of as bands.
  float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

  float hg(float c, float g) { // Henyey–Greenstein: light scatters mostly forward
    float g2 = g * g;
    return (1.0 - g2) / (12.566 * pow(1.0 + g2 - 2.0 * g * c, 1.5));
  }

  void main() {
    float d = texture2D(tDepth, vUv).r;
    vec4 view = uInvProj * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
    view /= view.w;
    vec3 hit = (uCamWorld * view).xyz;

    vec3 ray = hit - uCamPos;
    float len = min(length(ray), uMaxDist);
    vec3 dir = normalize(ray);
    float stepLen = len / float(uSteps);
    vec3 p = uCamPos + dir * stepLen * ign(gl_FragCoord.xy);

    float phase = hg(dot(dir, uKeyDir), 0.55);
    vec3 acc = vec3(0.0);
    float trans = 1.0;
    for (int i = 0; i < 24; i++) {
      if (i >= uSteps) break;
      vec4 sc = uShadowMatrix * vec4(p, 1.0);
      float lit = 1.0;
      if (sc.x > 0.0 && sc.x < 1.0 && sc.y > 0.0 && sc.y < 1.0 && sc.z < 1.0) lit = texture(tShadow, vec3(sc.xy, sc.z - 0.002));
      vec3 s = uKeyColor * lit * phase;
      for (int l = 0; l < ${MAX_LAMPS}; l++) {
        if (l >= uLamps) break;
        vec3 toL = uLampPos[l] - p;
        s += uLampColor[l] / (1.0 + dot(toL, toL) * 1.6) * 0.08;
      }
      acc += s * trans * uDensity * stepLen;
      trans *= exp(-uDensity * stepLen);
      p += dir * stepLen;
    }
    gl_FragColor = vec4(acc, 1.0);
  }
`;

export function volumetricMaterial() {
  return new ShaderMaterial({
    vertexShader: VS,
    fragmentShader: FS,
    uniforms: {
      tDepth: { value: null },
      tShadow: { value: null },
      uInvProj: { value: new Matrix4() },
      uCamWorld: { value: new Matrix4() },
      uShadowMatrix: { value: new Matrix4() },
      uCamPos: { value: new Vector3() },
      uKeyDir: { value: new Vector3(0, 1, 0) },
      uKeyColor: { value: new Color() },
      uDensity: { value: 0.01 },
      uMaxDist: { value: 90 },
      uSteps: { value: 12 },
      uLampPos: { value: Array.from({ length: MAX_LAMPS }, () => new Vector3()) },
      uLampColor: { value: Array.from({ length: MAX_LAMPS }, () => new Color()) },
      uLamps: { value: 0 },
    },
    depthTest: false,
    depthWrite: false,
  });
}
