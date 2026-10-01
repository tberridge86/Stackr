/** Original procedural material. No time uniform: all highlights follow the hand. */
export const CARD_FOIL_SHADER = `
uniform float2 size;
uniform float2 tilt;
uniform float mode;
uniform float foil;
uniform float specular;
uniform float texture;
uniform float patternScale;
uniform float maskKind;
uniform float regionCount;
uniform float4 regions[4];

float hash21(float2 p) {
  return fract(sin(dot(p, float2(127.1, 311.7))) * 43758.5453);
}
float region(float2 uv, float4 r) {
  float2 a = smoothstep(r.xy, r.xy + float2(0.004), uv);
  float2 b = 1.0 - smoothstep(r.xy + r.zw - float2(0.004), r.xy + r.zw, uv);
  return a.x * a.y * b.x * b.y;
}
float3 spectrum(float phase) {
  return 0.52 + 0.48 * cos(6.2831853 * (float3(0.0, 0.333, 0.667) + phase));
}
half4 main(float2 xy) {
  float2 uv = xy / size;
  // Material coordinates stay bonded to the card; changing the light selects
  // different microfacets instead of sliding a grain bitmap over the artwork.
  float2 p = uv * float2(1.0, 1.388889);
  float2 light = float2(0.52 - tilt.x * 0.42, 0.40 + tilt.y * 0.42);
  float2 d = (uv - light) * float2(1.0, 1.12);
  // Three hand-driven lobes make a material response: a broad sheen, a
  // directional foil band and a small glint. Nothing moves without input.
  float broad = exp(-dot(d, d) * 5.8);
  float sweep = dot(d, float2(0.74, -0.68));
  float crossSweep = dot(d, float2(0.68, 0.74));
  float directional = exp(-(sweep * sweep * 94.0 + crossSweep * crossSweep * 4.5));
  float glint = exp(-dot(d, d) * 54.0);
  float tiltEnergy = clamp(length(tilt), 0.0, 1.35);
  float mask = 0.0;
  for (int i = 0; i < 4; i++) {
    if (float(i) < regionCount) mask = max(mask, region(uv, regions[i]));
  }
  if (maskKind > 2.5) mask = 1.0 - mask;
  else if (maskKind < 1.5 && maskKind > 0.5) mask = 1.0;
  if (maskKind < 0.5) mask = 0.0;
  // Keep the cut edge quiet, including on full-card generic materials.
  float edge = smoothstep(0.0, 0.025, min(min(uv.x, 1.0-uv.x), min(uv.y, 1.0-uv.y)));
  mask *= edge;
  float lightPhase = tilt.x * 0.47 - tilt.y * 0.39;
  float phase = p.x * 1.3 + p.y * 0.85 + lightPhase;
  float grain = hash21(floor(p * 760.0));
  float response = 0.0;
  float3 tint = spectrum(phase);
  if (mode > 0.5 && mode < 1.5) {
    // Cosmos: fixed sparse inclusions with independently oriented facets.
    float2 cell = floor(p * 37.0 * patternScale);
    float2 local = fract(p * 37.0 * patternScale) - 0.5;
    float seed = hash21(cell);
    float radius = 0.055 + hash21(cell + 8.0) * 0.10;
    float dotStar = 1.0 - smoothstep(radius * 0.35, radius, length(local));
    float crossStar = exp(-abs(local.x) * 95.0) * exp(-abs(local.y) * 9.0)
                    + exp(-abs(local.y) * 95.0) * exp(-abs(local.x) * 9.0);
    float facet = pow(max(0.0, cos(seed * 19.0 + lightPhase * 8.0)), 8.0);
    response = step(0.69, seed) * (dotStar + crossStar * 0.3) * (0.10 + facet * 2.1 + directional * 0.35);
    tint = spectrum(seed + lightPhase * 0.65);
  } else if (mode > 1.5 && mode < 2.5) {
    float etched = pow(0.5 + 0.5 * sin((p.x - p.y) * 155.0 * patternScale), 12.0);
    float crossEtch = pow(0.5 + 0.5 * sin((p.x + p.y * 0.42) * 91.0 * patternScale), 17.0);
    response = 0.10 + etched * 0.38 + crossEtch * 0.18 + grain * 0.08 + directional * 0.22;
    tint = mix(float3(0.83, 0.87, 0.91), tint, 0.60);
  } else if (mode > 2.5 && mode < 3.5) {
    float groove = pow(0.5 + 0.5 * sin((p.x + p.y * 0.72) * 170.0 * patternScale + lightPhase * 13.0), 9.0);
    float beam = pow(0.5 + 0.5 * cos(phase * 14.0), 5.0);
    response = 0.10 + groove * 0.27 + beam * 0.48 + directional * 0.35;
  } else if (mode > 3.5 && mode < 4.5) {
    // Fine engraved contours perturb the lobe. This is a generic texture,
    // never described as the printing's actual embossed contour map.
    float contour = sin(p.x * 140.0 + sin(p.y * 68.0) * 2.3);
    float facet = pow(max(0.0, cos(contour * 0.85 + lightPhase * 4.8)), 12.0);
    float contourBand = pow(0.5 + 0.5 * sin(p.y * 84.0 + p.x * 17.0), 18.0);
    response = 0.06 + texture * (facet * 0.65 + contourBand * 0.30 + grain * 0.15) + directional * 0.12;
    tint = mix(float3(0.91, 0.93, 0.95), spectrum(phase * 0.70), 0.26);
  } else if (mode > 4.5) {
    float a = pow(0.5 + 0.5 * sin((p.x + p.y) * 112.0 * patternScale), 14.0);
    float b = pow(0.5 + 0.5 * sin((p.x - p.y) * 112.0 * patternScale), 14.0);
    float facet = pow(0.5 + 0.5 * cos(phase * 9.0), 4.0);
    response = (a + b) * (0.08 + facet * 0.72 + directional * 0.24);
    tint = spectrum(phase * 0.82);
  }
  // A narrow, spectral crest only appears where the hand-driven directional
  // lobe catches. Its colour shift is local, avoiding an all-over rainbow
  // wash while making a deliberate tilt visibly different from resting.
  float crestGrain = pow(0.5 + 0.5 * cos((p.x - p.y * 0.63) * 39.0 + lightPhase * 7.0), 9.0);
  float deliberateTilt = smoothstep(0.10, 0.90, tiltEnergy);
  float crest = directional * (0.18 + deliberateTilt * 0.82) * (0.62 + crestGrain * 0.38);
  if (mode > 0.5) {
    tint = mix(tint, spectrum(lightPhase * 0.92 + p.x * 0.22 - p.y * 0.16), clamp(crest * 0.92, 0.0, 0.92));
  }
  // A soft directional sheen ties the different verified finishes together.
  // It follows the same calibrated light as the microfacets, with no timer,
  // extra texture download or movement of the printed artwork itself.
  float ribbonDistance = abs(uv.x * 0.72 + uv.y * 0.28 - (0.50 + lightPhase * 0.42));
  float ribbon = pow(max(0.0, 1.0 - ribbonDistance / 0.22), 2.0);
  float sheen = mode > 0.5 ? (ribbon * 0.14 + crest * 0.82 + broad * 0.04) : 0.0;
  // Mild angle gain rewards deliberate inspection without making a resting
  // card look wet or obscuring type and rules text.
  float angleGain = 0.88 + tiltEnergy * 0.16;
  float foilAlpha = clamp(mask * foil * angleGain * (response * (0.20 + broad * 0.68) + sheen), 0.0, 0.40);
  float neutralAlpha = specular * (broad * 0.14 + directional * 0.24 + glint * 0.52) * edge;
  float alpha = min(0.44, foilAlpha + neutralAlpha);
  float3 premultiplied = tint * foilAlpha + float3(1.0) * neutralAlpha;
  return half4(min(premultiplied, float3(alpha)), alpha);
}
`;

export const CARD_FOIL_MODES = { plain: 0, cosmos: 1, reverse: 2, diagonal: 3, textured: 4, radiant: 5 } as const;
