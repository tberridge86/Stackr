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
  float broad = exp(-dot(d, d) * 6.5);
  float highlight = exp(-dot(d, d) * 32.0);
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
    response = step(0.69, seed) * (dotStar + crossStar * 0.3) * (0.10 + facet * 2.1);
    tint = spectrum(seed + lightPhase * 0.65);
  } else if (mode > 1.5 && mode < 2.5) {
    float etched = pow(0.5 + 0.5 * sin((p.x - p.y) * 155.0 * patternScale), 12.0);
    response = 0.16 + etched * 0.42 + grain * 0.10;
    tint = mix(float3(0.83, 0.87, 0.91), tint, 0.60);
  } else if (mode > 2.5 && mode < 3.5) {
    float groove = pow(0.5 + 0.5 * sin((p.x + p.y * 0.72) * 170.0 * patternScale + lightPhase * 13.0), 9.0);
    float beam = pow(0.5 + 0.5 * cos(phase * 14.0), 5.0);
    response = 0.14 + groove * 0.30 + beam * 0.62;
  } else if (mode > 3.5 && mode < 4.5) {
    // Fine engraved contours perturb the lobe. This is a generic texture,
    // never described as the printing's actual embossed contour map.
    float contour = sin(p.x * 140.0 + sin(p.y * 68.0) * 2.3);
    float facet = pow(max(0.0, cos(contour * 0.85 + lightPhase * 4.8)), 12.0);
    response = 0.08 + texture * (facet * 0.85 + grain * 0.18);
    tint = mix(float3(0.91, 0.93, 0.95), spectrum(phase * 0.70), 0.26);
  } else if (mode > 4.5) {
    float a = pow(0.5 + 0.5 * sin((p.x + p.y) * 112.0 * patternScale), 14.0);
    float b = pow(0.5 + 0.5 * sin((p.x - p.y) * 112.0 * patternScale), 14.0);
    float facet = pow(0.5 + 0.5 * cos(phase * 9.0), 4.0);
    response = (a + b) * (0.10 + facet * 0.95);
    tint = spectrum(phase * 0.82);
  }
  float foilAlpha = clamp(mask * foil * response * (0.24 + broad * 0.76), 0.0, 0.40);
  float neutralAlpha = specular * (broad * 0.18 + highlight * 0.60) * edge;
  float alpha = min(0.44, foilAlpha + neutralAlpha);
  float3 premultiplied = tint * foilAlpha + float3(1.0) * neutralAlpha;
  return half4(min(premultiplied, float3(alpha)), alpha);
}
`;

export const CARD_FOIL_MODES = { plain: 0, cosmos: 1, reverse: 2, diagonal: 3, textured: 4, radiant: 5 } as const;
