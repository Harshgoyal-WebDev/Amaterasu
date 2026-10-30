# Infinity Castle — modular asset library

Japanese "impossible architecture" kit built procedurally in Blender 5.2 for the Amaterasu R3F site.

```
blender/infinity_castle/
  infinity_castle_asset_library.blend   scenes: IC_Library (production) + IC_Presentation (cameras, lights, vignettes)
  exports/                              20 category GLBs + infinity_castle_asset_library.glb
  textures/                             tileable PBR source textures (wood x3 + normal/rough, tatami, shoji, lantern paper)
  previews/                             EEVEE renders from the 8 presentation cameras + showcase overview
  scripts/                              ic_lib.py + build_*.py + export_glb.py (re-run to rebuild everything)
public/assets/models/infinity-castle/   copies of the GLBs for useGLTF('/assets/models/infinity-castle/...')
```

## Standards
- Metres, +Z up in Blender (glTF export is +Y up). Grid **4 m**, storey **3.6 m**, interior clear height 3.0 m.
- Standard connection clear width **2.4 m** (doors, bridges, stairs, balcony openings). Floor top of every walkable module = z 0.
- Every asset is an Empty root `ICxx_Name` (identity rotation/scale) with mesh children `ICxx_Name__Part`.
  Root translation = its slot in the showcase rows; override `position` when you place it. 12/13 export centred on origin.
- `__SOCKET_*` empties mark connection points (arrow = outward). `__LightAnchor` empties mark where to put a point light per lantern.
- Moving parts are separate nodes with glTF extras: `ic_movable: "slide_x"`, `slide_distance`, (gateway) `slide_open_x` / `slide_closed_x`.
  Shoji leaf origin = bottom-left edge, slides along local X.
- Instanced pieces share mesh data, so the GLBs reuse meshes (clusters stay small).
- Textures export as WebP (`EXT_texture_webp`), lantern glow via `KHR_materials_emissive_strength`.
  M_Shoji_Paper uses light `KHR_materials_transmission` (0.15) — drop it at runtime if you need cheaper paper.

## Module dimensions
| Module | Footprint / origin | Tiles |
|---|---|---|
| IC03 Tatami room A/B | 8 x 8 centred, doors centred on N/S/E/W | stack every 3.6 m |
| IC04 Corridor A/B/C | 3.4 wide, y 0..4 | repeat every 4 m along +Y |
| IC05 Staircase Full / Half | rise 3.6 over 8 m / 1.8 over 4 m, origin = bottom step | |
| IC07 Bridge straight | 2.8 wide, y 0..4 (8 m variant too) | +Y every 4 m |
| IC07 Corner / Tee / Cross, IC08 Balconies | 4 x 4 (rect 4 x 8), x -2..2, y 0..L, origin = south edge | openings 2.4 centred |
| IC09 Frames | pillar at origin, 4 m spans | |
| IC14/IC15 Wall panels & windows | 1.2 or 2.4 wide x 3.0, origin bottom-left on wall centreline | |
| IC16 Ceilings / IC17 Floors | 4 x 4 centred | |

## Categories
01 gateway (doors open by default) · 02 shoji leaves + door frames (single/double, open/closed) · 03 rooms · 04 corridors ·
05 stairs · 06 inverted / wall-mounted (linked copies, geometry untouched) · 07 bridges · 08 balconies · 09 framework ·
10 lanterns (hanging rect, hanging hex, wall, standing) · 11 exterior room blocks (A, B two-storey, C gabled) ·
12 central abyss cluster (8 shaft towers, bridges, stairs, blocks, BG ring; core radius ~12 m kept clear) ·
13 infinite crossroads (hub with vertical shaft, corridors N/S/E/W, up/down stairs, crossing bridges at +7.2/+10.8) ·
14 wall panels · 15 windows & openings · 16 ceilings · 17 floors · 18 decor · 19 background (lightweight, emissive windows) · 20 void props

## R3F usage
```jsx
const { nodes } = useGLTF('/assets/models/infinity-castle/corridor_modules.glb')
const seg = nodes.IC04_Corridor_Straight_A
{Array.from({ length: 8 }, (_, i) => (
  <Clone key={i} object={seg} position={[0, 0, -4 * i]} />   // Blender +Y -> three -Z
))}
```

## Not included / limitations
- The reference sheet image is not embedded in 00_Reference (only a palette + material board); drop the PNG in as an image empty if wanted.
- No Draco/meshopt compression — run `gltf-transform optimize` if you need smaller files.
- Fog, particles, lights and sky are expected to come from the website; lights in IC_Presentation are preview-only.
