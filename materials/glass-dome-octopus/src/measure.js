// Screen-space measurement of the model, for comparison with the reference picture.
//
// Every value is in screen pixels of the current render, computed by projecting the model's own geometry with the
// live camera — the same quantities that were read off the reference picture by hand (see QUALITY_REPORT.md).
// mask(mode) renders the model as a flat black silhouette on white, so its bounding box can be measured by
// tools/measure.py without shadows, glow or background.
import * as THREE from 'three';

export function createMeasure({renderer, scene, camera, octo, canvas}) {
  const dims = octo.root.userData.dims;
  const v = new THREE.Vector3();
  const size = () => ({w: canvas.clientWidth, h: canvas.clientHeight});
  const proj = (p) => {
    const {w, h} = size();
    v.copy(p).project(camera);
    return {x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h};
  };
  const fpx = () => size().h / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  const fwd = new THREE.Vector3();
  const depth = (p) => {
    camera.getWorldDirection(fwd);
    return p.clone().sub(camera.position).dot(fwd);
  };
  /** projected diameter (px) of a sphere/disc of radius r at world point p */
  const diaPx = (r, p) => (2 * r * fpx()) / depth(p);

  function measure() {
    octo.root.updateMatrixWorld(true);
    const C = new THREE.Vector3(0, dims.bodyY, 0);
    const bodyPx = diaPx(dims.glassR, C);
    // dome visible height: top of the glass silhouette to the armour's top edge at the left / right silhouette
    let top = Infinity;
    for (let i = 0; i <= 90; i++) {
      for (let j = 0; j < 72; j++) {
        const p = new THREE.Vector3().setFromSphericalCoords(dims.glassR, (i / 90) * Math.PI * 0.6, (j / 72) * Math.PI * 2).add(C);
        top = Math.min(top, proj(p).y);
      }
    }
    let L = {x: Infinity, y: 0};
    let R = {x: -Infinity, y: 0};
    for (let j = 0; j < 360; j++) {
      const a = (j / 360) * Math.PI * 2;
      const q = proj(new THREE.Vector3(Math.sin(a) * dims.armorEdgeR, dims.bodyY + dims.armorEdgeY, Math.cos(a) * dims.armorEdgeR));
      if (q.x < L.x) L = q;
      if (q.x > R.x) R = q;
    }
    const domeH = (L.y + R.y) / 2 - top;
    // tentacles
    const arms = {};
    for (const a of octo.tentacles.arms) {
      const pts = a.joints.map((j) => j.getWorldPosition(new THREE.Vector3()));
      const last = a.joints[a.joints.length - 1];
      pts.push(new THREE.Vector3(last.userData.length || 0, 0, 0).applyMatrix4(last.matrixWorld));
      const sp = pts.map(proj);
      let len = 0;
      for (let i = 1; i < sp.length; i++) len += Math.hypot(sp[i].x - sp[i - 1].x, sp[i].y - sp[i - 1].y);
      // curl: screen bounding box of the last 40 % of the joints, padded by their radius
      const k0 = Math.floor(a.joints.length * 0.6);
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (let k = k0; k < a.joints.length; k++) {
        const p = pts[k];
        const s = sp[k];
        const r = diaPx(a.joints[k].userData.radius, p) / 2;
        x0 = Math.min(x0, s.x - r); x1 = Math.max(x1, s.x + r); y0 = Math.min(y0, s.y - r); y1 = Math.max(y1, s.y + r);
      }
      arms[a.name] = {
        segments: a.joints.length,
        lengthPx: +len.toFixed(1),
        rootPx: +diaPx(a.joints[0].userData.radius, pts[0]).toFixed(1),
        curlPx: +Math.max(x1 - x0, y1 - y0).toFixed(1),
        length3D: +a.length.toFixed(3),
      };
    }
    const cam = dims.camCentre;
    return {
      bodyPx: +bodyPx.toFixed(1),
      domeHPx: +domeH.toFixed(1),
      cameraHousingPx: +diaPx(dims.camHousingR, cam).toFixed(1),
      cameraLensPx: +diaPx(dims.camLensR, cam).toFixed(1),
      arms,
    };
  }

  /** Flat silhouette render: mode 'all' (whole robot) or 'body' (without tentacles). */
  function mask(mode = 'all') {
    const hidden = [];
    const hide = (o) => {
      if (o.visible) {
        o.visible = false;
        hidden.push(o);
      }
    };
    scene.traverse((o) => {
      if (o.isSprite || o.name === 'floor' || o.name === 'contact-shadow') hide(o);
    });
    if (mode === 'body') hide(octo.tentacles.group);
    const bg = scene.background;
    const tm = renderer.toneMapping;
    scene.background = new THREE.Color('#ffffff');
    scene.overrideMaterial = new THREE.MeshBasicMaterial({color: '#000000'});
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.render(scene, camera);
    return () => {
      scene.overrideMaterial.dispose();
      scene.overrideMaterial = null;
      scene.background = bg;
      renderer.toneMapping = tm;
      hidden.forEach((o) => (o.visible = true));
    };
  }
  return {measure, mask};
}
