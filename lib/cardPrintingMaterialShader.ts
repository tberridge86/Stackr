/**
 * Original map-driven SkSL. No noise, timer, rarity presets or fabricated grooves.
 * All maps are opaque 8-bit data PNGs, sampled in normalized artwork coordinates.
 * coverage.R: foil coverage; surface.RGB: tangent-space +Z normals (Y up).
 * pattern.R/G/B: spectral phase / diffraction strength / tangent orientation.
 * optical.R/G/B: roughness / reflectance / metallic spectral mixing.
 * Surface/pattern geometry stays fixed; only light/view response follows the hand.
 */
export const CARD_PRINTING_MATERIAL_SHADER = `
uniform shader coverageMap;
uniform shader surfaceMap;
uniform shader patternMap;
uniform shader opticalMap;
uniform float2 origin;
uniform float2 extent;
uniform float2 tilt;
uniform float gain;

float3 safeNormal(float3 v) { return v / max(length(v), 0.0001); }
float3 spectrum(float phase) {
  return 0.5 + 0.5 * cos(6.2831853 * (phase + float3(0.0, 0.3333333, 0.6666667)));
}
half4 main(float2 xy) {
  float2 uv = (xy - origin) / extent;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return half4(0.0);
  float coverage = clamp(coverageMap.eval(xy).r, 0.0, 1.0);
  if (coverage < 0.0001) return half4(0.0);
  float3 encoded = surfaceMap.eval(xy).rgb;
  float3 n = safeNormal(float3(encoded.r * 2.0 - 1.0, encoded.g * 2.0 - 1.0, max(0.03, encoded.b * 2.0 - 1.0)));
  float3 pattern = clamp(patternMap.eval(xy).rgb, 0.0, 1.0);
  float3 optical = clamp(opticalMap.eval(xy).rgb, 0.0, 1.0);
  float roughness = clamp(optical.r, 0.08, 1.0);
  float2 hand = clamp(tilt, float2(-1.0), float2(1.0));
  float3 light = safeNormal(float3(-hand.x * 0.95, hand.y * 0.95, 1.15));
  float3 view = float3(0.0, 0.0, 1.0);
  float3 h = safeNormal(light + view);
  float angle = pattern.b * 6.2831853;
  float3 axis = float3(cos(angle), sin(angle), 0.0);
  float3 tangent = safeNormal(axis - n * dot(n, axis));
  float3 bitangent = safeNormal(cross(n, tangent));
  float ndh = max(dot(n, h), 0.0001);
  float a = roughness * roughness;
  float along = dot(h, tangent);
  float across = dot(h, bitangent);
  float anisotropy = 1.0 + pattern.g * 7.0;
  float lobe = exp(-(along * along / (a * anisotropy) + across * across * anisotropy / a) / max(ndh * ndh, 0.03));
  float ndl = max(dot(n, light), 0.0);
  float fresnel = 0.04 + 0.96 * pow(1.0 - clamp(dot(n, view), 0.0, 1.0), 5.0);
  float phase = pattern.r + dot(light - view, tangent) * 1.7 + (1.0 - ndl) * 0.7;
  float3 tint = mix(float3(1.0), spectrum(phase), optical.b);
  float diffraction = pattern.g * lobe * optical.g * (0.55 + fresnel * 0.45);
  float reflection = optical.g * lobe * (0.10 + fresnel * 0.22);
  float alpha = clamp(coverage * gain * (diffraction + reflection), 0.0, 0.42);
  float energy = max(diffraction + reflection, 0.0001);
  float3 colour = (tint * diffraction + float3(reflection)) / energy;
  return half4(clamp(colour, 0.0, 1.0) * alpha, alpha);
}
`;
