// The studio: a near-white product backdrop with a soft floor shadow, a softbox environment for the clear coat to
// catch, a key light with soft shadows from the upper left front (as in the reference), a rim and a fill.
// The softbox environment follows Nyxera0x/cutaway's stage.js (MIT).
import * as THREE from 'three';

export const BG = '#eef0ef';

export function createStudio(renderer, scene, tier) {
  scene.background = new THREE.Color(BG);

  // ---- environment: softboxes in a light grey room, prefiltered once
  const env = new THREE.Scene();
  env.background = new THREE.Color('#d9dbda');
  const box = (w, h, pos, k, tint = [1, 0.99, 0.97]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({color: new THREE.Color(...tint).multiplyScalar(k), side: THREE.DoubleSide}));
    m.position.copy(pos);
    m.lookAt(0, 0, 0);
    env.add(m);
  };
  box(16, 10, new THREE.Vector3(-4, 16, 6), 3.0); // big top box
  box(3, 16, new THREE.Vector3(-15, 4, 8), 2.4); // tall strip, left front
  box(3, 16, new THREE.Vector3(14, 5, -6), 1.8, [0.96, 0.98, 1]); // rim strip behind
  box(20, 3, new THREE.Vector3(2, 2, 16), 1.4); // low card in front
  box(8, 8, new THREE.Vector3(10, 2, 12), 1.0); // fill, right front
  const ground = new THREE.Mesh(new THREE.CircleGeometry(40, 32), new THREE.MeshBasicMaterial({color: '#e6e8e6', side: THREE.DoubleSide}));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -3;
  env.add(ground);
  const pm = new THREE.PMREMGenerator(renderer);
  const envRT = pm.fromScene(env, 0.025);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.38;
  pm.dispose();
  env.traverse((o) => {
    o.geometry?.dispose();
    o.material?.dispose();
  });

  // ---- lights
  const key = new THREE.DirectionalLight('#fffaf3', 3.1);
  key.position.set(-1.6, 11, 2.4); // more overhead: the reference's shadow pools under the body
  key.target.position.set(0, 0.8, 0);
  key.castShadow = true;
  const span = 4.2;
  Object.assign(key.shadow.camera, {left: -span, right: span, top: span, bottom: -span, near: 1, far: 22});
  key.shadow.mapSize.set(tier.shadowSize, tier.shadowSize);
  key.shadow.radius = 9;
  key.shadow.blurSamples = 20;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.012;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight('#f2f6ff', 1.0);
  rim.position.set(3, 4, -6);
  scene.add(rim);
  const fill = new THREE.DirectionalLight('#fff6ec', 0.45);
  fill.position.set(5, 1, 6);
  scene.add(fill);
  scene.add(new THREE.HemisphereLight('#ffffff', '#b9beba', 0.3));

  // ---- floor: only the shadows draw (the background colour shows everywhere else)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({color: '#203028', opacity: 0.13}));
  floor.receiveShadow = true;
  floor.name = 'floor';
  scene.add(floor);
  // a wide, soft contact shadow pooled under the body (multiplied onto the backdrop)
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, 'rgba(30,45,38,0.42)');
  grd.addColorStop(0.45, 'rgba(30,45,38,0.18)');
  grd.addColorStop(1, 'rgba(30,45,38,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(7.5, 7.5).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({map: tex, transparent: true, depthWrite: false, toneMapped: false}));
  contact.position.y = 0.003;
  contact.renderOrder = -1;
  contact.name = 'contact-shadow';
  scene.add(contact);

  return {
    key,
    dispose() {
      envRT.dispose();
      tex.dispose();
      floor.geometry.dispose();
      floor.material.dispose();
      contact.geometry.dispose();
      contact.material.dispose();
    },
  };
}
