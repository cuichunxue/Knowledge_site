// STEP 4 — picking, highlight and focus.
//
// - Tap / click (not a drag) on the model -> the part under the pointer (raycast). Arms are InstancedMeshes: the
//   instance id leads to the joint and its arm; a pad of tentacle 5 opens P15.
// - Highlight: a green outline (inverted hull: the mesh again, back faces only, pushed out along its normals)
//   that pulses for the 0.2 s before the part moves.
// - Focus (TRIZ contradiction A, "many parts but easy to handle"): while a body part is selected the rest of the
//   model turns translucent; while an arm is selected the other arms are dimmed (instance colour).
import * as THREE from 'three';

const GREEN = '#2bff9c';

function outlineMaterial(width) {
  const m = new THREE.MeshBasicMaterial({color: GREEN, side: THREE.BackSide, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false});
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `vec3 transformed = vec3(position) + normalize(normal) * ${width.toFixed(4)};`);
  };
  m.customProgramCacheKey = () => `outline-${width}`;
  return m;
}

export function createInteraction({canvas, camera, octo, explosion, onPick, onHover, onDouble}) {
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const tent = octo.tentacles;
  const outlineBody = outlineMaterial(0.016); // body meshes are at world scale (x1.08 inside the dome)
  const outlineArm = outlineMaterial(0.07); // arm parts are built at radius 1 and scaled by ~0.06..0.23
  const ghostCache = new Map();

  // the pick list: every body mesh (not sprites) + the arms' pickable layers
  const pickables = [];
  octo.root.traverse((o) => {
    if (!o.isMesh || o.isSprite) return;
    if (o.parent === tent.group) {
      if (o.userData.pickable) pickables.push(o);
    } else if (o.userData.partId) pickables.push(o);
  });

  function partAt(x, y) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(pickables, false);
    for (const h of hits) {
      const o = h.object;
      if (!o.visible) continue;
      if (o.parent === tent.group) {
        const j = o.userData.joints[h.instanceId];
        if (!j) continue;
        const arm = j.userData.arm.name;
        if (o.userData.layer.pad && arm === 'T5') return 'P15';
        return `P${String(6 + Number(arm.slice(1))).padStart(2, '0')}`;
      }
      return o.userData.partId;
    }
    return null;
  }

  // ---- tap vs drag
  let down = null;
  let pending = null;
  canvas.addEventListener('pointerdown', (e) => {
    down = {x: e.clientX, y: e.clientY, t: e.timeStamp, id: e.pointerId};
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!down || e.pointerId !== down.id) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const quick = e.timeStamp - down.t < 450; // event times, not handler times: a busy frame must not stretch a tap
    down = null;
    if (!(moved < 7 && quick)) return;
    // a single tap picks after 0.28 s; a second tap inside that window is a double-tap (camera reset in
    // controls.js), so it must not also open / close a part
    const now = e.timeStamp;
    if (pending && now - pending.t < 300 && Math.hypot(e.clientX - pending.x, e.clientY - pending.y) < 40) {
      clearTimeout(pending.timer);
      pending = null;
      onDouble?.(); // double click / double tap: back to the home view
      return;
    }
    if (pending) {
      // the previous tap's window is over but its timer has not run yet (a busy frame): settle it first
      clearTimeout(pending.timer);
      const prev = pending;
      pending = null;
      onPick(partAt(prev.x, prev.y));
    }
    const x = e.clientX;
    const y = e.clientY;
    const decide = () => {
      // a second tap that started inside the window is still in progress: let its pointerup decide
      if (down && pending && down.t - pending.t < 300) {
        pending.timer = setTimeout(decide, 50);
        return;
      }
      pending = null;
      onPick(partAt(x, y));
    };
    pending = {t: now, x, y, timer: setTimeout(decide, 300)};
  });
  // hover cursor (mouse only, throttled)
  let hoverT = 0;
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || e.buttons) return;
    const now = performance.now();
    if (now - hoverT < 90) return;
    hoverT = now;
    const id = partAt(e.clientX, e.clientY);
    canvas.style.cursor = id ? 'pointer' : 'grab';
    onHover?.(id);
  });

  // ---- highlight: outline meshes that share the part's geometry and transforms
  let outlined = [];
  let pulse = null;
  function meshesOf(id) {
    const out = [];
    octo.root.traverse((o) => {
      if (o.isMesh && !o.isSprite && o.userData.partId === id && o.parent !== tent.group && !o.userData.outline) out.push(o);
    });
    return out;
  }
  function clearHighlight() {
    for (const om of outlined) {
      om.parent?.remove(om);
      if (om.isInstancedMesh) om.dispose();
    }
    outlined = [];
    tent.setOutline(null);
    tent.setTint(null);
  }
  function highlight(id) {
    clearHighlight();
    if (!id) return;
    const part = explosion.parts.find((p) => p.id === id);
    if (part.arm || id === 'P15') {
      const armName = part.arm || 'T5';
      tent.setOutline(armName, outlineArm);
      tent.setTint(armName, [0.86, 1, 0.92], [0.62, 0.64, 0.63]);
    } else {
      for (const m of meshesOf(id)) {
        let om;
        if (m.isInstancedMesh) {
          om = new THREE.InstancedMesh(m.geometry, outlineBody, m.count);
          om.instanceMatrix = m.instanceMatrix;
        } else om = new THREE.Mesh(m.geometry, outlineBody);
        om.userData.outline = true;
        om.raycast = () => {};
        om.renderOrder = 3;
        om.frustumCulled = false;
        m.add(om);
        outlined.push(om);
      }
    }
    pulse = performance.now();
  }
  /** Animate the outline pulse; returns true while it is still changing. */
  function tick() {
    if (pulse === null) return false;
    const k = Math.min(1, (performance.now() - pulse) / 200);
    const o = 1 - 0.45 * k; // bright flash, settling at 0.55 within the 0.2 s highlight
    outlineBody.opacity = o;
    outlineArm.opacity = o;
    if (k >= 1) pulse = null;
    return true;
  }

  // ---- focus: the rest of the model translucent (body parts) / other arms dimmed (arms)
  let ghosted = [];
  const ghostOf = (m) => {
    if (!ghostCache.has(m)) {
      const g = m.clone();
      g.transparent = true;
      g.opacity = m.transparent ? m.opacity * 0.5 : 0.22;
      g.depthWrite = false;
      ghostCache.set(m, g);
    }
    return ghostCache.get(m);
  };
  function clearFocus() {
    for (const [o, mat] of ghosted) o.material = mat;
    ghosted = [];
  }
  function focus(id) {
    clearFocus();
    if (!id) return;
    const part = explosion.parts.find((p) => p.id === id);
    if (part.arm || id === 'P15') return; // arms use the tint (see highlight)
    if (id === 'P01') return; // the lifted dome is about what it uncovers: keep the inside fully visible
    octo.root.traverse((o) => {
      if (!o.isMesh || o.isSprite || o.userData.outline || o.userData.partId === id) return;
      if (o.material.emissiveIntensity > 1 || o.name === 'dome-glass') return; // keep the lights and the glass as they are
      ghosted.push([o, o.material]);
      o.material = ghostOf(o.material);
    });
  }

  return {partAt, highlight, clearHighlight, focus, clearFocus, tick};
}
