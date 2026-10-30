# Infinity Castle

Route: `/infinity-castle` (`src/app/infinity-castle/page.js`). An endless, scroll-driven journey through the Blender kit in `blender/infinity_castle`.

## Layout

```
InfinityCastle.jsx        page root: WebGL check, error boundary → StaticFallback, overlays, input attach
config.js / state.js      every tunable / shared mutable state (journey) + low-frequency UI store
assets/
  manifest.js             asset manifest built from the real exports (paths, category, instancing, movables, origins)
  registry.js             GLB → prefabs: meshes baked + merged per material (24 m cells for the abyss),
                          sockets, light anchors, movable doors, occupancy solids; pooled instances
  materials.js            one material per name across files, lantern flicker, background fade
world/
  path.js                 camera paths: dense { position, orientation } samples, pace + clearance per metre
  builder.js              ChunkBuilder: place prefabs, instanced void dressing, stage-11 movers
  chunks/*.js             prologue (gate → fall), walkway, corridor/gallery, junction, stairs, room,
                          gravity, abyss, crossroads, falseExit (opens onto a fall or more corridor), drop
  director.js             scripted first journey, then weighted generation with cooldowns
  CastleWorld.js          navigation graph, lookahead building, overlap rejection, branch commits,
                          reversing, pruning, world rebasing
input/InputController.js  wheel / trackpad / touch / keys / buttons → intent channels
canvas/                   one R3F canvas: WorldController → CameraRig, pooled lantern lights,
                          fog + particles, wrapped background silhouettes, bloom (high tier)
audio/castleAudio.js      generative Web Audio (room tone, wind, creaks, shoji slides, biwa, footsteps, landing)
canvas/edgeBlurEffect.js  radial edge blur (speed lines), driven by speed and falls in Effects.jsx
canvas/Crows.jsx          crows from your model (see Crows below): flocks cross open spaces, caw (panned), wingbeats close by
audio/sound.js            the shared audio instance: two channels, music and sound, switched separately
ui/                       summons letter (lore + controls), intro, HUD (place, junction ways, sound), still fallback
```

## How it works

- The castle is a graph of chunks. Each chunk is assembled from prefabs and has paths from its entry to each exit. An exit's frame (position and orientation) is the next chunk's origin, so position, heading and roll stay continuous across chunks, including through the gravity twist.
- The camera is logical (`current chunk`, `s` metres along its path). Scrolling adds velocity, never position. Progress never becomes a global number. World coordinates are rebased past 1.5 km.
- Every exit of a nearby junction gets a real preview chunk, so every visible way on exists. Unchosen branches are released once out of view.
- Falls are the stretches a chunk marks with `drift(s, dir)`. Inside one, gravity drives the camera (`config.js → FALL`) and scroll input is ignored. Touching down brakes hard, dips the head and thuds.
- Walking: stride length grows with speed (walk → run). The camera bobs and rolls per footstep (`GAIT`), and each step plays a footfall. Both stop while falling or gliding through the void.
- Nothing may stand in a way. A moving dressing piece is sampled along its whole sweep: if any pose would cross its own chunk's path, it doesn't move. Each new chunk's dressing (every pose) is also checked against the paths of every live chunk, and theirs against its paths, and any piece that would block a way is removed (`CastleWorld.clearDressing`).
- Moving pieces sound for as long as they move: stone grinding on rough stone with timber runners rattling like a heavy drawer, panned to where the piece is.
- New chunks are tested against live ones (bounds plus per-mesh occupancy for the large clusters). If none fits, the door stays shut, or the castle drops you elsewhere. The abyss cluster's outer cells count as dressing: they are hidden where they would cut through another chunk.

## Assets

The runtime loads `public/assets/models/infinity-castle/web/*.glb`, meshopt-compressed copies of the exports (33 MB → 8.2 MB, about 5.3 MB on the wire, hierarchy and extras intact). The originals are untouched. To regenerate them after re-exporting from Blender:

```
npx @gltf-transform/cli meshopt public/assets/models/infinity-castle/<file>.glb public/assets/models/infinity-castle/web/<file>.glb
```

`infinity_castle_asset_library.glb` (combined file) is not loaded; the category files cover it.

## Performance

- Void dressing is drawn per copy. Each frame, copies outside the view or beyond the fog (`DRESSING.fogCutoff / fog density`) are skipped. Copies past `DRESSING.lodDistance` use a simplified mesh: a meshoptimizer index over the same vertices, made once per prefab, so it costs almost no memory. At the gate this took visible triangles from ~714k to ~105k.
- The pooled light count is fixed by the starting tier. A runtime tier drop would otherwise recompile every material at once.
- The post chain runs on every tier, with MSAA 2/0/0 and bloom on high only.

## Crows

The crow is `blender/infinity_castle/crow.blend` (armature `CrowRig`, 1,456 triangles, actions `flap` and `glide`), exported to `public/assets/models/infinity-castle/crow.glb` (`CROWS.url`; without the file there are no crows). When re-exporting, keep:

- the facing: −Y in Blender (+Z in glTF), with +Z up, in metres. The model is real size (0.95 m wingspan); `CROWS.scale` enlarges it in the castle.
- the action names `flap` (looping wingbeat) and `glide` (wings held out, played between bursts). Clips may start at frame 1; the loader shifts them to t = 0 so the loop doesn't hold its first pose.
- the export settings: GLB, +Y up, animations as actions, skinning on. The runtime clones the materials and adds a faint warm rim.

## Testing hooks

In development, `window.__castle` exposes `{ world, journey, ui, renderer }` for automated journey tests. It is stripped from production builds.

## Known limitations

- The post chain (edge blur, bloom on high only, tone mapping) runs on every tier; MSAA is 4/2/0.
- No dynamic shadows on any tier. The pooled lantern lights (8/6/4) plus emissive paper carry the lighting.
- Ambience and effects (gate doors, guttering lanterns, architecture transforming, biwa, footsteps) are synthesised. Background music is the first file found in `config.js → AUDIO.musicUrls` (currently the track in `public/assets/infinity-castle/music/`), at `musicVolume`. Music and sound have separate HUD toggles; with both off, the audio context is suspended. It loops quietly while sound is on, and the generated layers duck under it. If the file is missing, the ambience plays alone.
- The reduced-motion preference removes roll, sway, FOV kick and look-back exaggeration, and limits gravity twists to 90°. The paths themselves still turn.
