import * as THREE from "three";
import { CAMERA, DRESSING, FALL, GAIT, MOTION, REGIONS, WORLD } from "../config";
import { emitAudio, journey, uiStore } from "../state";
import { BODY_MARGIN, ChunkBuilder, boxNearPoints } from "./builder";
import CHUNKS from "./chunks";
import { SCRIPT, nextCandidates, rootState } from "./director";
import { createRng, hashSeed } from "./rng";

/**
 * CastleWorld — the infinite-world controller.
 *
 * The castle is a graph of placed chunks. Each node knows its chunk, its
 * world frame (position + orientation of its entry), its parent and the
 * child built at each exit. The camera's location is purely logical:
 * (current node, s along that node's path). Nothing is a global timeline,
 * so progress never grows without bound; world coordinates are periodically
 * rebased around the camera.
 *
 *   ensureAhead()  builds chunks along the intended route until 70 m of path
 *                  exist ahead; branching nodes near the camera get a preview
 *                  chunk on every exit, so every visible way on is real
 *   advance()      moves s, commits branches at decision points, hands over
 *                  between nodes in either direction
 *   clearDressing  a new chunk's void dressing (and the sweep of anything that
 *                  moves) may not cross an existing chunk's paths, nor theirs
 *                  its paths: offending pieces are removed, so you never walk
 *                  through a house that slid into the way
 *   prune()        drops chunks that are behind / on unchosen branches once
 *                  they are out of view; their prefab instances return to
 *                  the pool (geometry and materials are shared, never freed)
 */

const DIRS = ["forward", "left", "right", "up", "down"];
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qa = new THREE.Quaternion();
const _qr = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _box = new THREE.Box3();
const _box2 = new THREE.Box3();
const _sphere = new THREE.Sphere();
const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _box3 = new THREE.Box3();
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);

export class CastleWorld {
  constructor({ registry, quality, reducedMotion = false, seed = 7 }) {
    this.registry = registry;
    this.quality = quality;
    this.reducedMotion = reducedMotion;
    this.seed = seed;
    this.root = new THREE.Group();
    this.root.name = "CastleWorld";
    this.nodes = new Set();
    this.nextId = 1;
    this.current = null;
    this.s = 0;
    this.v = 0;
    this.lateral = 0;
    this.lateralTarget = 0;
    this.preference = "forward";
    this.prefTarget = null;
    this.junctionDist = Infinity;
    this.leanYaw = 0;
    this.leanPitch = 0;
    this.junctionKey = "";
    this.regionKey = "";
    this.frustum = new THREE.Frustum();
    this.time = 0;
    this.frameCount = 0;
    this.prevY = 0;
    this.falling = false;
    this.landingT = 0;
    this.barrier = null; // { node, s }: where the last fall landed — no climbing back up it
    this.pathQuat = new THREE.Quaternion();
    this.rebaseListeners = new Set();
    this.camRight = new THREE.Vector3(1, 0, 0);
    this.camPos = new THREE.Vector3();
  }

  /** Called with the offset whenever world coordinates shift; returns an unsubscribe. */
  onRebase(fn) {
    this.rebaseListeners.add(fn);
    return () => this.rebaseListeners.delete(fn);
  }

  // ── setup ────────────────────────────────────────────────────────────
  start(aspect = 1.6) {
    const node = this.createNode(SCRIPT[0], rootState(), { p: new THREE.Vector3(), q: new THREE.Quaternion() }, null, null, true);
    this.current = node;
    journey.chunkCount = 1;
    const { startZ, approachFrom } = node.chunk.meta;
    this.s = approachFrom - (aspect < 0.85 ? startZ.portrait : startZ.landscape);
    this.startS = this.s;
    this.ensureAhead(8);
    this.computePose(0);
    this.prevY = journey.pose.p.y;
  }

  /** Release every chunk (the root group stays mounted, so start() can run again). */
  stop() {
    for (const n of this.nodes) n.chunk.dispose(this.registry);
    this.nodes.clear();
    this.current = null;
    this.prefTarget = null;
    this.junctionKey = "";
    this.regionKey = "";
    this.s = 0;
    this.v = 0;
    this.lateral = this.lateralTarget = 0;
    this.leanYaw = this.leanPitch = 0;
    this.falling = false;
    this.landingT = 0;
    this.barrier = null;
  }

  dispose() {
    this.stop();
  }

  setQuality(quality, reducedMotion) {
    this.quality = quality;
    this.reducedMotion = reducedMotion;
  }

  // ── nodes ────────────────────────────────────────────────────────────
  createNode(spec, state, frame, parent, dir, force) {
    const seed = hashSeed(parent ? parent.seed : this.seed, dir || "root", state.index, spec.type);
    const builder = new ChunkBuilder({
      registry: this.registry,
      rng: createRng(seed),
      quality: this.quality,
      alive: state.alive,
      index: state.index,
      reducedMotion: this.reducedMotion,
      seed,
    });
    const chunk = CHUNKS[spec.type].build(builder, spec.opts || {});
    const g = chunk.group;
    g.position.copy(frame.p);
    g.quaternion.copy(frame.q);
    g.updateMatrixWorld(true);
    const worldBox = chunk.bounds.clone().applyMatrix4(g.matrixWorld);
    const boxes = [worldBox, ...(chunk.solids || []).map((b) => b.clone().applyMatrix4(g.matrixWorld))];
    const broad = boxes.reduce((acc, b) => acc.union(b), new THREE.Box3());
    if (!force && this.overlaps(boxes, broad, parent)) {
      chunk.dispose(this.registry);
      return null;
    }
    this.root.add(g);
    const node = {
      id: this.nextId++,
      chunk,
      spec,
      state,
      seed,
      frame: { p: frame.p.clone(), q: frame.q.clone() },
      parent,
      parentDir: dir,
      children: {},
      chosen: null,
      worldBox,
      boxes,
      broad,
      soft: (chunk.softParts || []).map((sp) => ({ mesh: sp.mesh, box: sp.box.clone().applyMatrix4(g.matrixWorld) })),
      matrix: new THREE.Matrix4(),
      inv: new THREE.Matrix4(),
      anchorsWorld: [],
      camLocal: new THREE.Vector3(),
      pathPts: [],
      pathBox: new THREE.Box3(),
      dressBox: new THREE.Box3(),
    };
    this.syncNode(node);
    this.cullSoft(node);
    this.indexNode(node);
    this.clearDressing(node);
    this.nodes.add(node);
    return node;
  }

  /** World-space path samples (every metre) and the extent of the node's dressing. */
  indexNode(node) {
    for (const e of Object.values(node.chunk.exits)) {
      const pts = e.path.p;
      for (let i = 0; i < pts.length; i += 4) node.pathPts.push(pts[i].clone().applyMatrix4(node.matrix));
      node.pathPts.push(pts[pts.length - 1].clone().applyMatrix4(node.matrix));
    }
    node.pathBox.setFromPoints(node.pathPts).expandByScalar(BODY_MARGIN);
    node.dressBox.makeEmpty();
    for (const d of node.chunk.dressing || []) node.dressBox.union(_box.copy(d.region).applyMatrix4(node.matrix));
  }

  /** Remove dressing that would stand in (or move through) another chunk's way — both directions. */
  clearDressing(node) {
    this.hideBlocking(node, node); // its own ways too (pieces placed beside the path on purpose are exempt)
    for (const n of this.nodes) {
      if (n === node) continue;
      this.hideBlocking(node, n);
      this.hideBlocking(n, node);
    }
  }

  hideBlocking(owner, other) {
    if (owner.dressBox.isEmpty() || !owner.dressBox.intersectsBox(other.pathBox)) return;
    for (const d of owner.chunk.dressing) {
      if (d.hidden || (d.force && owner === other)) continue;
      _box3.copy(d.region).applyMatrix4(owner.matrix).expandByScalar(BODY_MARGIN);
      if (!_box3.intersectsBox(other.pathBox)) continue;
      for (const inv of d.inv) {
        // world → this pose's prefab space
        _m2.multiplyMatrices(inv, owner.inv);
        if (boxNearPoints(d.bounds, _m2, other.pathPts, BODY_MARGIN, _box3)) {
          owner.chunk.hideDressing(d);
          break;
        }
      }
    }
  }

  syncNode(node) {
    const g = node.chunk.group;
    g.position.copy(node.frame.p);
    g.quaternion.copy(node.frame.q);
    g.updateMatrixWorld(true);
    node.matrix.copy(g.matrixWorld);
    node.inv.copy(node.matrix).invert();
    // update in place so lights holding an anchor follow it through a rebase
    const anchors = node.chunk.anchors;
    if (node.anchorsWorld.length !== anchors.length) node.anchorsWorld = anchors.map((a) => ({ p: new THREE.Vector3(), power: a.power }));
    anchors.forEach((a, i) => node.anchorsWorld[i].p.copy(a.p).applyMatrix4(node.matrix));
  }

  /** Does a candidate (its occupancy boxes + their union) collide with any live chunk but its parent? */
  overlaps(boxes, broad, parent) {
    const m = WORLD.overlapMargin;
    _box.copy(broad).expandByScalar(-m);
    if (_box.isEmpty()) return false;
    for (const n of this.nodes) {
      if (n === parent) continue;
      if (!_box.intersectsBox(_box2.copy(n.broad).expandByScalar(-m))) continue;
      for (const a of boxes) {
        _box.copy(a).expandByScalar(-m);
        if (_box.isEmpty()) continue;
        for (const b of n.boxes) if (_box.intersectsBox(_box2.copy(b).expandByScalar(-m))) return true;
      }
      _box.copy(broad).expandByScalar(-m);
    }
    return false;
  }

  /** Hide soft cluster cells that would cut through another chunk (both directions). */
  cullSoft(node) {
    const hits = (sp, boxes) => {
      _box.copy(sp.box).expandByScalar(-WORLD.overlapMargin);
      return !_box.isEmpty() && boxes.some((b) => _box.intersectsBox(b));
    };
    for (const n of this.nodes) {
      if (n === node) continue;
      for (const sp of n.soft) if (sp.mesh.visible && sp.box.intersectsBox(node.broad) && hits(sp, node.boxes)) sp.mesh.visible = false;
      for (const sp of node.soft) if (sp.mesh.visible && sp.box.intersectsBox(n.broad) && hits(sp, n.boxes)) sp.mesh.visible = false;
    }
  }

  exitFrame(node, dir) {
    const e = node.chunk.exits[dir].frame;
    return { p: e.p.clone().applyMatrix4(node.matrix), q: node.frame.q.clone().multiply(e.q) };
  }

  buildChild(node, dir) {
    const frame = this.exitFrame(node, dir);
    const cands = nextCandidates(node.state, createRng(hashSeed(node.seed, dir, "next")));
    let child = null;
    for (const c of cands) {
      child = this.createNode(c.spec, c.state, frame, node, dir, false);
      if (child) break;
    }
    if (!child) {
      const exits = node.chunk.exits;
      const others = Object.keys(exits).filter((d) => d !== dir && !exits[d].sealed && node.children[d] !== null);
      if (others.length) {
        // no room for anything here: the door stays shut
        exits[dir].sealed = true;
        node.children[dir] = null;
        node.chunk.onSeal?.(dir);
        return;
      }
      const last = cands[cands.length - 1];
      child = this.createNode(last.spec, last.state, frame, node, dir, true);
    }
    node.children[dir] = child;
  }

  removeNode(node) {
    node.chunk.dispose(this.registry);
    this.nodes.delete(node);
    if (node.parent && node.parent.children[node.parentDir] === node) delete node.parent.children[node.parentDir];
    for (const c of Object.values(node.children)) if (c && c.parent === node) c.parent = null;
    if (this.prefTarget === node) this.prefTarget = null;
    if (this.barrier?.node === node) this.barrier = null;
  }

  // ── routing ──────────────────────────────────────────────────────────
  openDirs(node) {
    const exits = node.chunk.exits;
    return DIRS.filter((d) => exits[d] && !exits[d].sealed && node.children[d] !== null);
  }

  intendedDir(node) {
    if (node.chosen) return node.chosen;
    const dirs = this.openDirs(node);
    if (dirs.length <= 1) return dirs[0] || node.chunk.defaultDir;
    if (node === this.prefTarget && dirs.includes(this.preference)) return this.preference;
    return dirs.includes(node.chunk.defaultDir) ? node.chunk.defaultDir : dirs[0];
  }

  pathOf(node) {
    return node.chunk.exits[this.intendedDir(node)].path;
  }

  isBranching(node) {
    return Object.keys(node.chunk.exits).length > 1;
  }

  ensureAhead(budget) {
    let node = this.current;
    let ahead = this.pathOf(node).length - this.s;
    let depth = 0;
    while (node && depth <= WORLD.maxDepthAhead) {
      const all = depth <= 1 || (this.isBranching(node) && ahead < 45);
      const dirs = node.chosen ? [node.chosen] : all ? Object.keys(node.chunk.exits) : [this.intendedDir(node)];
      for (const dir of dirs) {
        if (node.children[dir] !== undefined || node.chunk.exits[dir].sealed) continue;
        if (budget-- <= 0) return;
        this.buildChild(node, dir);
      }
      const next = node.children[this.intendedDir(node)];
      if (!next || ahead > WORLD.lookaheadDistance) break;
      node = next;
      ahead += this.pathOf(node).length;
      depth++;
    }
  }

  commit(node, dir) {
    if (node.chosen) return;
    node.chosen = dir;
    if (this.isBranching(node)) {
      node.chunk.onCommit?.(dir);
      if (node === this.prefTarget) this.preference = "forward";
      if (!uiStore.get().hintsSeen) uiStore.set({ hintsSeen: true });
    }
  }

  enter(next) {
    this.current = next;
    journey.chunkCount++;
    if (next.chunk.oneWay) {
      // behind a one-way threshold: everything that came before is released
      const keep = new Set();
      const walk = (n) => {
        keep.add(n);
        for (const c of Object.values(n.children)) if (c) walk(c);
      };
      walk(next);
      for (const n of [...this.nodes]) if (!keep.has(n)) this.removeNode(n);
      next.parent = null;
    }
    if (next.state.alive && !journey.alive) {
      journey.alive = true;
      emitAudio("biwa", 1.3);
      emitAudio("transform", 1.2);
      emitAudio("flicker", 1);
    }
    next.chunk.onEnter?.();
  }

  advance(ds) {
    this.s += ds;
    for (let guard = 0; guard < 8; guard++) {
      const node = this.current;
      if (this.barrier?.node === node && this.s < this.barrier.s) {
        // you fell to get here: there is no way back up
        this.s = this.barrier.s;
        this.v = Math.max(this.v, 0);
        break;
      }
      if (this.isBranching(node) && !node.chosen && this.s >= node.chunk.decisionS) this.commit(node, this.intendedDir(node));
      const path = this.pathOf(node);
      if (this.s > path.length) {
        const dir = this.intendedDir(node);
        const next = node.children[dir];
        if (!next) {
          // the next chunk isn't ready yet: hold at the threshold
          this.s = path.length;
          this.v = Math.min(this.v, 0);
          break;
        }
        this.commit(node, dir);
        this.s -= path.length;
        this.enter(next);
        continue;
      }
      if (this.s < 0) {
        const parent = node.parent;
        if (!parent || parent.children[node.parentDir] !== node || node.chunk.oneWay) {
          this.s = 0;
          this.v = Math.max(this.v, 0);
          break;
        }
        this.current = parent;
        this.s += this.pathOf(parent).length;
        continue;
      }
      break;
    }
  }

  /** Orientation `d` metres further along the intended route (crosses into the next node). */
  sampleAheadQuat(d, out) {
    let node = this.current;
    let s = this.s + d;
    for (let i = 0; i < 3; i++) {
      const path = this.pathOf(node);
      if (s <= path.length) break;
      const next = node.children[this.intendedDir(node)];
      if (!next) {
        s = path.length;
        break;
      }
      s -= path.length;
      node = next;
    }
    this.pathOf(node).at(s, null, out);
    return out.premultiply(node.frame.q);
  }

  // ── per frame ────────────────────────────────────────────────────────
  setPreference(dir) {
    if (dir === this.preference) return;
    this.preference = dir;
  }

  update(dt, intent, camera) {
    if (!this.current) return;
    this.time += dt;
    this.frameCount++;
    const node = this.current;
    const path = this.pathOf(node);
    const reduced = this.reducedMotion;

    if (intent.preference) {
      const p = intent.preference;
      // lateral flick towards the opposite side cancels back to "forward"
      if ((p === "left" && this.preference === "right") || (p === "right" && this.preference === "left") || (p === "up" && this.preference === "down") || (p === "down" && this.preference === "up")) this.setPreference("forward");
      else this.setPreference(p);
    }

    // velocity (path metres / s, before the path's pace)
    const scale = reduced ? MOTION.reducedMotionScale : 1;
    // a fast scroll raises the ceiling; it relaxes back as the scrolling slows
    this.boost = Math.max(intent.boost || 1, (this.boost || 1) - dt * 0.6);
    const maxSpeed = MOTION.maxSpeed * scale * this.boost;
    const drift = journey.started ? node.chunk.drift?.(this.s, this.intendedDir(node)) || 0 : 0;
    const falling = drift > 0;
    if (this.falling && !falling) this.land();
    this.falling = journey.falling = falling;
    this.landingT = Math.max(0, this.landingT - dt);
    if (falling) {
      // the floor is gone: gravity has you, scrolling does nothing
      this.v = Math.min(Math.max(this.v, drift) + FALL.gravity * scale * dt, FALL.terminal * scale);
    } else if (this.landingT > 0) {
      this.v *= Math.exp(-dt / FALL.landingDamping);
    } else {
      this.v += intent.impulse;
      if (intent.axis) {
        const target = intent.axis * MOTION.keySpeed;
        this.v += Math.sign(target - this.v) * Math.min(Math.abs(target - this.v), MOTION.keyAccel * dt);
      } else {
        this.v *= Math.exp(-dt / MOTION.damping);
      }
      this.v = THREE.MathUtils.clamp(this.v, -maxSpeed, maxSpeed);
    }
    if (!journey.started && Math.abs(this.v) > 0.05) {
      journey.started = true;
      uiStore.set({ phase: "journey" });
    }
    if (Math.abs(this.v) < 0.002) this.v = 0;
    let pace = path.pace(this.s);
    if (reduced) pace = Math.min(pace, 2.2);
    this.advance(this.v * pace * dt);
    this.ensureAhead(WORLD.buildsPerFrame);

    // lateral offset inside the current clearance
    const cur = this.pathOf(this.current);
    const clear = cur.clear(this.s);
    if (intent.lateralAxis) this.lateralTarget = intent.lateralAxis * clear;
    else this.lateralTarget = (this.lateralTarget + intent.lateral) * Math.exp(-dt / MOTION.lateralReturn);
    this.lateralTarget = THREE.MathUtils.clamp(this.lateralTarget, -clear, clear);
    const prevLateral = this.lateral;
    this.lateral += (this.lateralTarget - this.lateral) * (1 - Math.exp(-dt * MOTION.lateralSmoothing));
    this.lateral = THREE.MathUtils.clamp(this.lateral, -Math.max(clear, 0.02), Math.max(clear, 0.02));
    journey.pose.lateralVel = dt > 0 ? (this.lateral - prevLateral) / dt : 0;

    this.updateJunction();
    this.computePose(dt);

    // journey state for the DOM / audio / atmosphere
    const c = this.current.chunk;
    journey.speed = Math.abs(this.v * pace);
    const vy = dt > 0 ? (journey.pose.p.y - this.prevY) / dt : 0;
    this.prevY = journey.pose.p.y;
    const fallTarget = THREE.MathUtils.clamp(-vy / 18, 0, 1);
    journey.fall += (fallTarget - journey.fall) * (1 - Math.exp(-dt * 3));
    this.updateGait(dt, vy);
    const openness = typeof c.voidness === "function" ? c.voidness(this.s) : (c.voidness ?? 0.3);
    journey.void += (openness - journey.void) * (1 - Math.exp(-dt * 1.2));
    journey.blackout = c.blackout ? c.blackout(this.s) : 0;
    journey.fogTarget = typeof c.fog === "function" ? c.fog(this.s) : (c.fog ?? journey.fogTarget);
    journey.progress = c.progress ? c.progress(this.s) : 1;
    const regionKey = c.region(this.s);
    if (regionKey !== this.regionKey) {
      this.regionKey = regionKey;
      const r = REGIONS[regionKey];
      if (r) uiStore.set({ region: { key: regionKey, ...r }, regionSerial: uiStore.get().regionSerial + 1 });
    }

    // chunk behaviours (doors, trapdoors, moving architecture)
    if (camera) {
      _m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      this.frustum.setFromProjectionMatrix(_m);
    }
    if (camera) {
      this.camPos.copy(camera.position);
      this.camRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
    }
    // past this the fog has swallowed everything (the thinner of now / where it's heading, so nothing pops in late)
    const fogFar = DRESSING.fogCutoff / Math.max(1e-4, Math.min(journey.fogDensity, journey.fogTarget));
    const ctx = { dt, time: this.time, alive: journey.alive, camLocal: null, isCurrent: false, isVisible: this.isVisibleLocal, panOf: this.panOf, fogFar };
    for (const n of this.nodes) {
      ctx.node = n;
      ctx.camLocal = n.camLocal.copy(journey.pose.p).applyMatrix4(n.inv);
      ctx.isCurrent = n === this.current;
      n.chunk.update(ctx);
    }

    if (this.frameCount % 15 === 0) this.prune(camera);
    this.maybeRebase(camera);
  }

  /** Touching down after a fall: brake hard, dip the head, thud. */
  land() {
    const k = THREE.MathUtils.clamp(this.v / FALL.terminal, 0.35, 1);
    this.landingT = FALL.landingTime * k;
    journey.landing = k;
    emitAudio("land", k);
    this.barrier = { node: this.current, s: this.s };
  }

  /** Strides for the head bob and footsteps — only with a floor underfoot. */
  updateGait(dt, vy) {
    const speed = journey.speed;
    const steep = Math.abs(vy) > Math.max(speed, 0.5) * 0.8; // gliding / climbing through the void, not walking
    const grounded = !this.falling && this.landingT <= 0 && !steep;
    const k = 1 - Math.exp(-dt * 5);
    journey.gait += ((grounded ? THREE.MathUtils.clamp(speed / 1.6, 0, 1) : 0) - journey.gait) * k;
    journey.run += (THREE.MathUtils.clamp((speed - GAIT.runFrom) / (GAIT.runFull - GAIT.runFrom), 0, 1) - journey.run) * k;
    if (!grounded || speed < 0.15) return;
    const before = Math.floor(journey.stride);
    // sprinting lengthens the stride rather than turning the steps into a drumroll
    const stepLen = THREE.MathUtils.lerp(GAIT.walkStep, GAIT.runStep, journey.run) * Math.max(1, speed / GAIT.runFull);
    journey.stride += (speed * dt) / stepLen;
    if (Math.floor(journey.stride) !== before && journey.gait > 0.35) emitAudio("step", 0.45 + 0.55 * journey.run);
  }

  /** Stereo pan (-1..1) of a chunk-local point as heard from the camera. */
  panOf = (center, group) => {
    _v.copy(center).applyMatrix4(group.matrixWorld).sub(this.camPos);
    const len = _v.length();
    return len > 0.001 ? THREE.MathUtils.clamp(_v.dot(this.camRight) / len, -1, 1) * 0.8 : 0;
  };

  isVisibleLocal = (center, radius, group) => {
    _sphere.set(_v.copy(center).applyMatrix4(group.matrixWorld), radius);
    return this.frustum.intersectsSphere(_sphere);
  };

  updateJunction() {
    let node = this.current;
    let dist = -this.s;
    let target = null;
    for (let d = 0; d < 3 && node; d++) {
      if (this.isBranching(node) && !node.chosen) {
        target = node;
        dist += node.chunk.decisionS;
        break;
      }
      dist += this.pathOf(node).length;
      node = node.children[this.intendedDir(node)];
    }
    this.prefTarget = target;
    this.junctionDist = target ? dist : Infinity;
    let key = "";
    let junction = null;
    if (target && dist < WORLD.junctionHintDistance && dist > -0.5) {
      const available = this.openDirs(target);
      const selected = this.intendedDir(target);
      key = `${target.id}|${available.join(",")}|${selected}`;
      junction = { id: target.id, available, selected, type: target.chunk.type };
    }
    if (key !== this.junctionKey) {
      this.junctionKey = key;
      uiStore.set({ junction });
    }
  }

  computePose(dt = 0) {
    const node = this.current;
    const path = this.pathOf(node);
    path.at(this.s, _p, _q);
    _p.applyMatrix4(node.matrix);
    _q.premultiply(node.frame.q);
    this.pathQuat.copy(_q);
    this.sampleAheadQuat(CAMERA.lookAhead, _qa);
    _q.slerp(_qa, 0.5);

    // lean towards the branch you've picked as you approach it (smoothed, so
    // it hands over to the branch path's own turn without a snap)
    let yawT = 0;
    let pitchT = 0;
    const dj = this.junctionDist;
    if (this.prefTarget && dj < WORLD.junctionLeanDistance && dj > 0) {
      const sel = this.intendedDir(this.prefTarget);
      const k = (1 - dj / WORLD.junctionLeanDistance) * CAMERA.junctionLean * (this.reducedMotion ? 0.5 : 1);
      if (sel === "left") yawT = k;
      else if (sel === "right") yawT = -k;
      else if (sel === "up") pitchT = k * 0.8;
      else if (sel === "down") pitchT = -k * 0.8;
    }
    const kLean = 1 - Math.exp(-dt * 2.5);
    this.leanYaw += (yawT - this.leanYaw) * kLean;
    this.leanPitch += (pitchT - this.leanPitch) * kLean;
    if (this.leanYaw) _q.multiply(_qr.setFromAxisAngle(Y, this.leanYaw));
    if (this.leanPitch) _q.multiply(_qr.setFromAxisAngle(X, this.leanPitch));

    _v.set(1, 0, 0).applyQuaternion(this.pathQuat);
    _p.addScaledVector(_v, this.lateral);
    journey.pose.p.copy(_p);
    journey.pose.q.copy(_q);
  }

  prune(camera) {
    const keep = new Set();
    let a = this.current;
    for (let k = 0; a && k <= WORLD.keepBehind; k++, a = a.parent) keep.add(a);
    const walk = (n, d) => {
      keep.add(n);
      if (d >= WORLD.maxDepthAhead + 1) return;
      for (const [dir, c] of Object.entries(n.children)) if (c && (!n.chosen || n.chosen === dir)) walk(c, d + 1);
    };
    walk(this.current, 0);
    const camPos = camera ? camera.position : journey.pose.p;
    for (const n of [...this.nodes]) {
      if (keep.has(n)) continue;
      const far = n.worldBox.distanceToPoint(camPos) > WORLD.pruneDistance;
      if (far || !this.frustum.intersectsBox(n.worldBox)) this.removeNode(n);
    }
  }

  maybeRebase(camera) {
    const p = journey.pose.p;
    if (p.lengthSq() < WORLD.rebaseDistance * WORLD.rebaseDistance) return;
    const off = p.clone().round();
    for (const n of this.nodes) {
      n.frame.p.sub(off);
      this.syncNode(n);
      _v.copy(off).negate();
      for (const b of n.boxes) b.translate(_v); // boxes[0] is worldBox
      for (const sp of n.soft) sp.box.translate(_v);
      n.broad.translate(_v);
      for (const pt of n.pathPts) pt.add(_v);
      n.pathBox.translate(_v);
      n.dressBox.translate(_v);
    }
    p.sub(off);
    this.prevY -= off.y;
    if (camera) {
      camera.position.sub(off);
      camera.updateMatrixWorld();
    }
    for (const fn of this.rebaseListeners) fn(off);
  }

  /** Visit every lantern anchor in world space. */
  forEachAnchor(fn) {
    for (const n of this.nodes) for (const a of n.anchorsWorld) fn(a);
  }

  stats() {
    let objects = 0;
    this.root.traverse(() => objects++);
    return { nodes: this.nodes.size, objects, current: this.current?.chunk.type, s: this.s, ...this.registry.stats() };
  }
}

export { DIRS };
