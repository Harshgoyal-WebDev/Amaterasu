import * as THREE from "three";
import gsap from "gsap";
import { DRESSING } from "../config";
import { emitAudio } from "../state";

/**
 * ChunkBuilder — the toolkit chunk definitions use to assemble architecture.
 *
 *   place()    structural prefab instance (pooled Meshes, shared geometry);
 *              registers its LightAnchors and grows the chunk's bounds
 *   dress()    void dressing; batched into InstancedMeshes per prefab part
 *              when the chunk is finalised; skipped if it would block a path.
 *              Each frame every copy is culled on its own (outside the view,
 *              or beyond what the fog lets through) and drawn from a
 *              simplified mesh when far away.
 *              A moving piece is checked along its whole sweep: if any pose
 *              would cross a path it stays put. The world later hides pieces
 *              that land on *another* chunk's path (chunk.hideDressing).
 *   finalize() returns the Chunk the world manager navigates
 *
 * The builder group sits at the origin while building, so matrixWorld is the
 * chunk-local matrix.
 */

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, "YXZ");
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _box = new THREE.Box3();
const _sphere = new THREE.Sphere();
const _inv = new THREE.Matrix4();
const _lp = new THREE.Vector3();
const _pp = new THREE.Vector3();
const _pq = new THREE.Quaternion();
const _ps = new THREE.Vector3();
const _rq = new THREE.Quaternion();
const _v3 = new THREE.Vector3();
const _c = new THREE.Vector3();
const SWEEP_STEPS = 6;

// a person's clearance around the camera when checking architecture against a path
export const BODY_MARGIN = 1.1;

/** Pose of a moving piece at progress k (0..1) given its decomposed base. */
function poseAt(spec, pos, quat, scl, k, out) {
  _pp.copy(pos);
  _pq.copy(quat);
  if (spec.type === "slide") _pp.addScaledVector(_v3.fromArray(spec.offset || [0, 0, 0]), k);
  if (spec.type === "appear") _pp.addScaledVector(_v3.fromArray(spec.offset || [0, 0, 0]), 1 - k);
  if (spec.type === "rotate") _pq.premultiply(_rq.setFromAxisAngle(_v3.fromArray(spec.axis || [0, 1, 0]), (spec.angle ?? Math.PI / 2) * k));
  return out.compose(_pp, _pq, scl);
}

/** Does a box (in its own space), posed by `inv` (inverse pose), come within `margin` of any point? */
export function boxNearPoints(box, inv, points, margin, filter = null) {
  for (const p of points) {
    if (filter && !filter.containsPoint(p)) continue;
    if (box.distanceToPoint(_lp.copy(p).applyMatrix4(inv)) < margin) return true;
  }
  return false;
}

export function composeMatrix(t = {}, out = new THREE.Matrix4()) {
  const p = t.p ? (t.p.isVector3 ? t.p : _p.set(t.p[0], t.p[1], t.p[2])) : _p.set(0, 0, 0);
  if (t.q) _q.copy(t.q);
  else if (t.r) _q.setFromEuler(_e.set(t.r[0], t.r[1], t.r[2], "YXZ"));
  else _q.set(0, 0, 0, 1);
  if (t.ry != null) _q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.ry));
  if (t.s == null) _s.set(1, 1, 1);
  else if (typeof t.s === "number") _s.set(t.s, t.s, t.s);
  else _s.set(t.s[0], t.s[1], t.s[2]);
  return out.compose(p.clone(), _q.clone(), _s.clone());
}

function applyTransform(object, t) {
  composeMatrix(t, _m).decompose(object.position, object.quaternion, object.scale);
}

export class ChunkBuilder {
  constructor({ registry, rng, quality, alive, index, reducedMotion, seed }) {
    this.registry = registry;
    this.rng = rng;
    this.quality = quality;
    this.alive = alive;
    this.index = index;
    this.reducedMotion = reducedMotion;
    this.seed = seed;
    this.group = new THREE.Group();
    this.instances = [];
    this.anchors = [];
    this.bounds = new THREE.Box3();
    this.solids = []; // extra fine-grained occupancy boxes (large clusters)
    this.softParts = []; // cluster cells that may be hidden to make room
    this.parts = []; // a box per solid piece of structure (what flying things steer round)
    this.dressItems = new Map();
    this.ownObjects = [];
    this.avoidPoints = [];
    this.avoidMargin = 1.6;
    this.updaters = [];
  }

  /** Paths whose neighbourhood dressing must keep clear of. */
  avoid(paths, margin = 1.6) {
    this.avoidMargin = margin;
    for (const path of paths) {
      for (let i = 0; i < path.p.length; i += 4) this.avoidPoints.push(path.p[i]);
      this.avoidPoints.push(path.p[path.p.length - 1]);
    }
  }

  clearOf(center, radius) {
    const r = radius + this.avoidMargin;
    const r2 = r * r;
    for (const p of this.avoidPoints) if (p.distanceToSquared(center) < r2) return false;
    return true;
  }

  place(name, t = {}, opts = {}) {
    const inst = this.registry.acquire(name);
    applyTransform(inst.object, t);
    (opts.parent || this.group).add(inst.object);
    this.instances.push(inst);
    this.group.updateMatrixWorld(true);
    const mw = inst.object.matrixWorld;
    if (opts.lights !== false) {
      for (const a of inst.prefab.anchors) this.anchors.push({ p: a.clone().applyMatrix4(mw), power: opts.lightPower ?? 1 });
    }
    if (opts.bounds !== false) this.bounds.union(_box.copy(inst.prefab.bounds).applyMatrix4(mw));
    if (opts.bounds !== false || opts.solids) {
      const { prefab } = inst;
      const boxes = prefab.solids.length ? [...prefab.solids, ...prefab.parts.filter((p) => p.soft).map((p) => p.geometry.boundingBox)] : [prefab.bounds];
      for (const box of boxes) this.parts.push(box.clone().applyMatrix4(mw));
    }
    if (opts.solids) {
      for (const box of inst.prefab.solids) this.solids.push(box.clone().applyMatrix4(mw));
      for (const mesh of inst.soft) this.softParts.push({ mesh, box: mesh.geometry.boundingBox.clone().applyMatrix4(mw) });
    }
    return inst;
  }

  /** Socket transform of a placed instance, chunk-local. */
  socket(inst, key) {
    const s = inst.prefab.sockets[key];
    if (!s) return null;
    this.group.updateMatrixWorld(true);
    return s.p.clone().applyMatrix4(inst.object.matrixWorld);
  }

  anchor(p, power = 1) {
    this.anchors.push({ p: p.isVector3 ? p.clone() : new THREE.Vector3(...p), power });
  }

  /**
   * Void dressing (instanced). opts.essential skips the quality thinning,
   * opts.mover makes it one of the castle's moving pieces (stage 11).
   */
  dress(name, t = {}, opts = {}) {
    if (!opts.essential && this.rng.next() > this.quality.dressing) return false;
    const prefab = this.registry.get(name);
    const matrix = composeMatrix(t, new THREE.Matrix4());
    prefab.bounds.getBoundingSphere(_sphere).applyMatrix4(matrix);
    if (!opts.force && !this.clearOf(_sphere.center, _sphere.radius)) return false;
    const sphere = _sphere.clone();
    // every pose the piece will take (a moving piece: sampled along its sweep)
    let mover = opts.mover || null;
    let poses = [matrix];
    if (mover) {
      matrix.decompose(_pp, _pq, _ps);
      const pos = _pp.clone();
      const quat = _pq.clone();
      const scl = _ps.clone();
      const sweep = [];
      for (let i = 0; i <= SWEEP_STEPS; i++) sweep.push(poseAt(mover, pos, quat, scl, i / SWEEP_STEPS, new THREE.Matrix4()));
      const blocked = this.avoidPoints.length && sweep.some((m) => boxNearPoints(prefab.bounds, _inv.copy(m).invert(), this.avoidPoints, this.avoidMargin));
      if (blocked) mover = null; // it would cross the way: it stays where it is
      else poses = sweep;
    }
    const region = new THREE.Box3();
    for (const m of poses) region.union(_box.copy(prefab.bounds).applyMatrix4(m));
    let list = this.dressItems.get(name);
    if (!list) this.dressItems.set(name, (list = []));
    list.push({ matrix, mover, sphere, force: !!opts.force, bounds: prefab.bounds, region, inv: poses.map((m) => m.clone().invert()) });
    if (opts.lights) for (const a of prefab.anchors) this.anchors.push({ p: a.clone().applyMatrix4(matrix), power: opts.lightPower ?? 0.8 });
    return true;
  }

  add(object, { bounds = true } = {}) {
    this.group.add(object);
    this.ownObjects.push(object);
    if (bounds) {
      this.group.updateMatrixWorld(true);
      this.bounds.union(_box.setFromObject(object));
    }
    return object;
  }

  onUpdate(fn) {
    this.updaters.push(fn);
  }

  /** Build instanced dressing + movers and return the Chunk. */
  finalize(def) {
    const movers = [];
    const instanced = [];
    const dressing = [];
    const sets = []; // per prefab: near + far InstancedMeshes and their copies
    const instancedFor = (name, parts, capacity) =>
      parts.map((part) => {
        const im = new THREE.InstancedMesh(part.geometry, part.material, capacity);
        im.name = name;
        im.count = 0;
        im.visible = false;
        im.frustumCulled = false; // culled per copy below
        this.group.add(im);
        instanced.push(im);
        return im;
      });
    for (const [name, items] of this.dressItems) {
      const prefab = this.registry.get(name);
      const lod = prefab.lodParts;
      const set = {
        near: instancedFor(name, prefab.flatParts, items.length),
        far: lod.some((p) => p.lod) ? instancedFor(name, lod, items.length) : null,
        sphere: prefab.bounds.getBoundingSphere(new THREE.Sphere()),
        copies: [],
      };
      sets.push(set);
      for (const it of items) {
        const d = { matrix: it.matrix.clone(), scale: it.matrix.getMaxScaleOnAxis(), force: it.force, bounds: it.bounds, region: it.region, inv: it.inv, mover: null, hidden: false };
        dressing.push(d);
        set.copies.push(d);
        if (!it.mover) continue;
        d.mover = createMover(it, d, this);
        movers.push(d.mover);
      }
    }

    // which copies are drawn this frame, and at what detail
    const fill = (meshes, n) => {
      for (const im of meshes) {
        im.count = n;
        im.visible = n > 0;
        if (n) im.instanceMatrix.needsUpdate = true;
      }
    };
    const cullDressing = (ctx) => {
      for (const set of sets) {
        let near = 0;
        let far = 0;
        for (const d of set.copies) {
          if (d.hidden) continue;
          _c.copy(set.sphere.center).applyMatrix4(d.matrix);
          const r = set.sphere.radius * d.scale;
          const dist = ctx.camLocal.distanceTo(_c) - r;
          if (dist > ctx.fogFar || !ctx.isVisible(_c, r * 1.1 + 2, this.group)) continue;
          if (set.far && dist > DRESSING.lodDistance) {
            for (const im of set.far) im.setMatrixAt(far, d.matrix);
            far++;
          } else {
            for (const im of set.near) im.setMatrixAt(near, d.matrix);
            near++;
          }
        }
        fill(set.near, near);
        if (set.far) fill(set.far, far);
      }
    };
    const bounds = (def.bounds || this.bounds).clone();
    for (const p of def.extraBoundsPaths || []) for (const pt of p.p) bounds.expandByPoint(pt);
    for (const e of Object.values(def.exits)) for (let i = 0; i < e.path.p.length; i += 8) bounds.expandByPoint(e.path.p[i]);

    const builder = this;
    const chunk = {
      type: def.type,
      seed: this.seed,
      group: this.group,
      exits: def.exits, // { dir: { frame: {p,q}, path, sealed? } }
      defaultDir: def.defaultDir || Object.keys(def.exits)[0],
      decisionS: def.decisionS ?? 0,
      anchors: this.anchors,
      bounds,
      solids: this.solids,
      softParts: this.softParts,
      parts: this.parts,
      region: def.region || (() => def.type),
      fog: def.fog ?? null,
      voidness: def.voidness ?? 0.3,
      drift: def.drift || null,
      airborne: def.airborne || null, // (s, dir) → true where the path leaves the floor without falling (no footsteps)
      blackout: def.blackout || null,
      progress: def.progress || null,
      meta: def.meta || {},
      oneWay: !!def.oneWay,
      hint: def.hint || null,
      movers,
      dressing,
      instanced,
      /** Remove a dressing piece (it would block another chunk's way); its move is cancelled. */
      hideDressing(d) {
        if (d.hidden) return;
        d.hidden = true;
        d.mover?.disable();
      },
      onCommit: def.onCommit || null,
      onUncommit: def.onUncommit || null,
      onSeal: def.onSeal || null,
      onEnter: def.onEnter || null,
      update(ctx) {
        for (const fn of builder.updaters) fn(ctx);
        for (const m of movers) m.update(ctx);
        cullDressing(ctx);
      },
      dispose(registry) {
        for (const m of movers) m.kill();
        for (const inst of builder.instances) registry.release(inst);
        for (const im of instanced) {
          im.removeFromParent();
          im.dispose();
        }
        for (const o of builder.ownObjects) {
          o.removeFromParent();
          o.traverse((c) => {
            if (c.isMesh && c.userData.ownGeometry) c.geometry.dispose();
            if (c.isMesh && c.userData.ownMaterial) c.material.dispose();
          });
        }
        def.dispose?.();
        builder.group.removeFromParent();
      },
    };
    return chunk;
  }
}

/**
 * Stage 11 — architecture that moves on its own. Driven by distance to the
 * camera (chunk-local), only while the castle is "alive". Rotations snap
 * while the piece is out of view and tween while it is visible.
 */
function createMover(item, copy, builder) {
  const spec = item.mover;
  const base = item.matrix.clone();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  base.decompose(pos, quat, scl);
  const state = { k: 0, triggered: false };
  let tween = null;
  const center = item.sphere.center.clone();

  // the culling pass draws the copy from its matrix
  const write = () => {
    if (!state.disabled) poseAt(spec, pos, quat, scl, state.k, copy.matrix);
  };
  if (spec.type === "appear") write();

  return {
    update(ctx) {
      if (state.triggered || !ctx.alive) return;
      const d = ctx.camLocal.distanceTo(center);
      if (d > (spec.distance ?? 40)) return;
      state.triggered = true;
      const hidden = spec.type === "rotate" && !ctx.isVisible(center, item.sphere.radius, builder.group);
      if (hidden) {
        state.k = 1;
        write();
        return;
      }
      // stone dragged over stone, timber runners in their grooves — for as long as it moves
      const duration = spec.duration ?? 6;
      const near = THREE.MathUtils.clamp(1.15 - d / (spec.distance ?? 40), 0.35, 1);
      emitAudio("grind", near, { duration, pan: ctx.panOf?.(center, builder.group) ?? 0 });
      emitAudio(spec.sound || "transform", 0.35 * near);
      emitAudio("biwa", 0.5);
      tween = gsap.to(state, { k: 1, duration, ease: "sine.inOut", onUpdate: write });
    },
    disable() {
      state.triggered = true;
      state.disabled = true;
      tween?.kill();
    },
    kill() {
      tween?.kill();
    },
  };
}
