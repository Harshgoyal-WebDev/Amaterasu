import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { MeshoptSimplifier } from "meshoptimizer";
import { DRESSING } from "../config";
import { CELL_SPLIT } from "./manifest";
import { createMaterialLibrary } from "./materials";

/**
 * Asset registry: turns the loaded GLBs into prefabs.
 *
 * Each `ICxx_Name` root becomes a Prefab whose static meshes are baked into
 * root space and merged per material (the abyss goes from 1316 draw calls to
 * a few per 24 m cell). Movable nodes (`ic_movable` extras) stay separate so
 * doors can slide; sockets and light anchors are kept as plain transforms.
 *
 * Prefab instances share geometry + materials, so placing one is just a few
 * Mesh objects. Instances are pooled; nothing is ever re-loaded or re-merged.
 */

// the simplifier is WASM: ready long before the GLBs are (until then, far copies use the full mesh)
let simplifierReady = false;
MeshoptSimplifier.ready.then(() => (simplifierReady = true)).catch(() => {});

/**
 * Far version of a part: a new index over the same vertices (vertex
 * clustering, so seams and flat-shaded edges don't stop it), so it costs
 * almost no memory. Small parts are kept as they are.
 */
function simplifyPart(part, ratio) {
  const { geometry } = part;
  const index = geometry.index?.array;
  const tris = index ? index.length / 3 : 0;
  if (!simplifierReady || tris < 400) return part;
  const pos = geometry.getAttribute("position");
  const [lod] = MeshoptSimplifier.simplifySloppy(index instanceof Uint32Array ? index : new Uint32Array(index), pos.array, 3, null, Math.max(3, Math.floor(tris * ratio) * 3), 0.02);
  if (!lod.length || lod.length >= index.length * 0.85) return part;
  const g = new THREE.BufferGeometry();
  for (const name of ["position", "normal", "uv"]) if (geometry.getAttribute(name)) g.setAttribute(name, geometry.getAttribute(name));
  g.setIndex(new THREE.BufferAttribute(lod, 1));
  g.boundingBox = geometry.boundingBox;
  g.boundingSphere = geometry.boundingSphere;
  return { geometry: g, material: part.material, lod: true };
}

const SOFT_RADIUS = 34; // m from a cluster's origin: inside = structure, outside = dressing
const _m = new THREE.Matrix4();
const _inv = new THREE.Matrix4();
const _box = new THREE.Box3();
const _v = new THREE.Vector3();

function toFloat32(attr) {
  const { count, itemSize } = attr;
  const out = new Float32Array(count * itemSize);
  for (let i = 0; i < count; i++) {
    const o = i * itemSize;
    out[o] = attr.getX(i);
    if (itemSize > 1) out[o + 1] = attr.getY(i);
    if (itemSize > 2) out[o + 2] = attr.getZ(i);
    if (itemSize > 3) out[o + 3] = attr.getW(i);
  }
  return new THREE.BufferAttribute(out, itemSize);
}

/** Copy a mesh geometry into a uniform layout (position/normal/uv, Uint32 index) baked by `matrix`. */
function bake(geometry, matrix) {
  const src = geometry;
  const g = new THREE.BufferGeometry();
  const pos = src.getAttribute("position");
  g.setAttribute("position", toFloat32(pos));
  if (src.getAttribute("normal")) g.setAttribute("normal", toFloat32(src.getAttribute("normal")));
  g.setAttribute("uv", src.getAttribute("uv") ? toFloat32(src.getAttribute("uv")) : new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2));
  let index;
  if (src.index) {
    index = new Uint32Array(src.index.count);
    for (let i = 0; i < index.length; i++) index[i] = src.index.getX(i);
  } else {
    index = new Uint32Array(pos.count);
    for (let i = 0; i < index.length; i++) index[i] = i;
  }
  if (matrix.determinant() < 0) {
    for (let i = 0; i < index.length; i += 3) {
      const t = index[i + 1];
      index[i + 1] = index[i + 2];
      index[i + 2] = t;
    }
  }
  g.setIndex(new THREE.BufferAttribute(index, 1));
  if (!g.getAttribute("normal")) g.computeVertexNormals();
  g.applyMatrix4(matrix);
  return g;
}

function mergeBuckets(buckets) {
  const parts = [];
  for (const { material, geometries } of buckets.values()) {
    const merged = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries, false);
    if (geometries.length > 1) geometries.forEach((g) => g.dispose());
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    parts.push({ geometry: merged, material });
  }
  return parts;
}

const shortName = (name) => {
  const i = name.lastIndexOf("__");
  return i >= 0 ? name.slice(i + 2) : name;
};

export class Prefab {
  constructor(name) {
    this.name = name;
    this.parts = [];
    this.movables = []; // { key, extras, matrix, parts }
    this.anchors = [];
    this.sockets = {};
    this.bounds = new THREE.Box3();
    this.solids = []; // per-mesh boxes for large prefabs (fine-grained overlap tests)
    this.extras = {};
    this._flat = null;
    this._lod = null;
  }

  /** Simplified flatParts for far-away dressing copies. */
  get lodParts() {
    if (this._lod) return this._lod;
    const lod = this.flatParts.map((p) => simplifyPart(p, DRESSING.lodRatio));
    if (simplifierReady) this._lod = lod; // otherwise try again next time
    return lod;
  }

  /** Static + movable parts in their default pose, merged by material (for InstancedMesh dressing). */
  get flatParts() {
    if (this._flat) return this._flat;
    if (!this.movables.length) {
      this._flat = this.parts;
      return this._flat;
    }
    const buckets = new Map();
    const add = (geometry, material, matrix) => {
      let b = buckets.get(material);
      if (!b) buckets.set(material, (b = { material, geometries: [] }));
      const g = geometry.clone();
      if (matrix) g.applyMatrix4(matrix);
      b.geometries.push(g);
    };
    for (const p of this.parts) add(p.geometry, p.material, null);
    for (const mv of this.movables) for (const p of mv.parts) add(p.geometry, p.material, mv.matrix);
    this._flat = mergeBuckets(buckets);
    return this._flat;
  }

  dispose() {
    const seen = new Set();
    const disposeParts = (parts) =>
      parts.forEach((p) => {
        if (!seen.has(p.geometry)) {
          seen.add(p.geometry);
          p.geometry.dispose();
        }
      });
    disposeParts(this.parts);
    this.movables.forEach((m) => disposeParts(m.parts));
    if (this._flat) disposeParts(this._flat);
    // far versions share vertex buffers with the full ones; both go together here
    if (this._lod) disposeParts(this._lod.filter((p) => p.lod));
  }
}

/** A placed copy of a prefab: Meshes that share the prefab's geometry. */
export class PrefabInstance {
  constructor(prefab) {
    this.prefab = prefab;
    this.object = new THREE.Group();
    this.object.name = prefab.name;
    this.soft = [];
    for (const p of prefab.parts) {
      const mesh = new THREE.Mesh(p.geometry, p.material);
      if (p.soft) this.soft.push(mesh);
      this.object.add(mesh);
    }
    this.movables = {};
    for (const mv of prefab.movables) {
      const g = new THREE.Group();
      g.name = mv.key;
      mv.matrix.decompose(g.position, g.quaternion, g.scale);
      for (const p of mv.parts) g.add(new THREE.Mesh(p.geometry, p.material));
      this.object.add(g);
      this.movables[mv.key] = { object: g, base: g.position.clone(), extras: mv.extras, axis: new THREE.Vector3(1, 0, 0).applyQuaternion(g.quaternion) };
    }
  }

  reset() {
    for (const k in this.movables) {
      const mv = this.movables[k];
      mv.object.position.copy(mv.base);
    }
    this.object.position.set(0, 0, 0);
    this.object.quaternion.identity();
    this.object.scale.set(1, 1, 1);
    this.object.visible = true;
    for (const m of this.soft) m.visible = true;
    this.object.userData = {};
  }

  /** Offset a movable along its own local X (the slide axis). */
  slide(key, metres) {
    const mv = this.movables[key];
    if (!mv) return;
    mv.object.position.copy(mv.base).addScaledVector(mv.axis, metres);
  }
}

export function buildRegistry(gltfs) {
  const materials = createMaterialLibrary();
  const prefabs = new Map();

  for (const gltf of gltfs) {
    const scene = gltf.scene;
    scene.updateMatrixWorld(true);
    for (const root of scene.children) {
      if (!/^IC\d\d_/.test(root.name)) continue;
      const prefab = new Prefab(root.name);
      prefab.extras = { ...root.userData };
      const cell = CELL_SPLIT[root.name] || 0;
      _inv.copy(root.matrixWorld).invert();
      const staticBuckets = new Map();

      const visit = (node, movable) => {
        if (node !== root && node.userData?.ic_movable && !movable) {
          // movable subtree: baked relative to the movable node
          const mv = { key: shortName(node.name), extras: { ...node.userData }, matrix: new THREE.Matrix4(), parts: [] };
          mv.matrix.multiplyMatrices(_inv, node.matrixWorld);
          const mvInv = new THREE.Matrix4().copy(node.matrixWorld).invert();
          const buckets = new Map();
          node.traverse((child) => {
            if (!child.isMesh) return;
            const material = materials.unify(child.material);
            const g = bake(child.geometry, _m.multiplyMatrices(mvInv, child.matrixWorld));
            let b = buckets.get(material);
            if (!b) buckets.set(material, (b = { material, geometries: [] }));
            b.geometries.push(g);
          });
          mv.parts = mergeBuckets(buckets);
          prefab.movables.push(mv);
          return;
        }
        if (/LightAnchor/.test(node.name)) {
          prefab.anchors.push(_v.setFromMatrixPosition(_m.multiplyMatrices(_inv, node.matrixWorld)).clone());
        } else if (/__SOCKET_/.test(node.name)) {
          const key = node.name.split("__SOCKET_").pop();
          const m = new THREE.Matrix4().multiplyMatrices(_inv, node.matrixWorld);
          const p = new THREE.Vector3();
          const q = new THREE.Quaternion();
          m.decompose(p, q, new THREE.Vector3());
          prefab.sockets[key] = { p, q };
        }
        if (node.isMesh) {
          const material = materials.unify(node.material);
          const g = bake(node.geometry, _m.multiplyMatrices(_inv, node.matrixWorld));
          let key = material.uuid;
          if (cell) {
            g.computeBoundingBox();
            g.boundingBox.getCenter(_v);
            if (Math.hypot(_v.x, _v.z) < SOFT_RADIUS) prefab.solids.push(g.boundingBox.clone());
            key += `|${Math.floor(_v.x / cell)},${Math.floor(_v.y / cell)},${Math.floor(_v.z / cell)}`;
          }
          let b = staticBuckets.get(key);
          if (!b) staticBuckets.set(key, (b = { material, geometries: [] }));
          b.geometries.push(g);
        }
        for (const c of node.children) visit(c, movable);
      };
      visit(root, false);
      prefab.parts = mergeBuckets(staticBuckets);
      if (cell) {
        // outer cells are set dressing: hidden where they would cut through other chunks
        for (const part of prefab.parts) {
          part.geometry.boundingBox.getCenter(_v);
          part.soft = Math.hypot(_v.x, _v.z) >= SOFT_RADIUS;
        }
      }

      prefab.bounds.makeEmpty();
      for (const p of prefab.parts) prefab.bounds.union(p.geometry.boundingBox);
      for (const mv of prefab.movables)
        for (const p of mv.parts) prefab.bounds.union(_box.copy(p.geometry.boundingBox).applyMatrix4(mv.matrix));
      prefabs.set(root.name, prefab);
    }
  }

  const pool = new Map(); // name → PrefabInstance[]
  let disposeTimer = null;

  const registry = {
    prefabs,
    materials,
    get(name) {
      const p = prefabs.get(name);
      if (!p) throw new Error(`[InfinityCastle] missing prefab ${name}`);
      return p;
    },
    has: (name) => prefabs.has(name),
    acquire(name) {
      const list = pool.get(name);
      if (list && list.length) return list.pop();
      return new PrefabInstance(registry.get(name));
    },
    release(inst) {
      inst.object.removeFromParent();
      inst.reset();
      let list = pool.get(inst.prefab.name);
      if (!list) pool.set(inst.prefab.name, (list = []));
      if (list.length < 48) list.push(inst);
    },
    stats() {
      let pooled = 0;
      for (const l of pool.values()) pooled += l.length;
      return { prefabs: prefabs.size, materials: materials.byName.size, pooled };
    },
    dispose() {
      for (const p of prefabs.values()) p.dispose();
      materials.dispose();
      pool.clear();
    },
    /** Mounted: cancel a pending release (dev StrictMode remounts immediately). */
    retain() {
      clearTimeout(disposeTimer);
    },
    /** Unmounted: free GPU resources unless something takes the registry back soon. */
    release() {
      clearTimeout(disposeTimer);
      disposeTimer = setTimeout(() => registry.dispose(), 4000);
    },
  };
  return registry;
}
