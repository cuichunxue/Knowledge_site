// Camera controls: drag to orbit 360°, wheel / pinch to zoom, double-click (double-tap) to go home,
// optional auto-rotate. Built on three's OrbitControls (touch included). Pan is off: the model stays centred.
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/OrbitControls.js';

/** Camera position from an orbit description around a target. az / el in degrees (az 0 = +z, 90 = +x). */
export function orbit(target, az, el, dist) {
  const a = THREE.MathUtils.degToRad(az);
  const e = THREE.MathUtils.degToRad(el);
  return new THREE.Vector3(
    target.x + dist * Math.cos(e) * Math.sin(a),
    target.y + dist * Math.sin(e),
    target.z + dist * Math.cos(e) * Math.cos(a),
  );
}

export function createControls(camera, dom, {target, home, onChange}) {
  const controls = new OrbitControls(camera, dom);
  controls.target.copy(target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = 3.2;
  controls.maxDistance = 22;
  controls.minPolarAngle = THREE.MathUtils.degToRad(8);
  controls.maxPolarAngle = THREE.MathUtils.degToRad(88); // never under the floor
  controls.rotateSpeed = 0.7;
  controls.zoomSpeed = 0.9;
  controls.autoRotateSpeed = 0.9;
  controls.touches = {ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE};

  let tween = null;
  const goTo = (view, ms = 900) => {
    const from = camera.position.clone();
    const fromT = controls.target.clone();
    const to = orbit(view.target, view.az, view.el, view.dist);
    const t0 = performance.now();
    tween = {from, fromT, to, toT: view.target.clone(), t0, ms};
    onChange?.();
  };
  // home may be a function, so it is measured at the current aspect (portrait phones need a longer distance)
  const reset = (ms) => goTo(typeof home === 'function' ? home() : home, ms);

  // double click / double tap -> home
  dom.addEventListener('dblclick', () => reset());
  let lastTap = 0;
  dom.addEventListener('touchend', (e) => {
    if (e.touches.length) return;
    const now = performance.now();
    if (now - lastTap < 300) reset();
    lastTap = now;
  }, {passive: true});
  controls.addEventListener('start', () => (tween = null));
  controls.addEventListener('change', () => onChange?.());

  /** Advance damping / tween / auto-rotate; returns true while the view is still moving. */
  const update = () => {
    if (tween) {
      const k = Math.min(1, (performance.now() - tween.t0) / tween.ms);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      // orbit-interpolate so the camera swings round instead of cutting through the model
      const sFrom = new THREE.Spherical().setFromVector3(tween.from.clone().sub(tween.fromT));
      const sTo = new THREE.Spherical().setFromVector3(tween.to.clone().sub(tween.toT));
      let dTheta = sTo.theta - sFrom.theta;
      if (dTheta > Math.PI) dTheta -= Math.PI * 2;
      if (dTheta < -Math.PI) dTheta += Math.PI * 2;
      const s = new THREE.Spherical(
        THREE.MathUtils.lerp(sFrom.radius, sTo.radius, e),
        THREE.MathUtils.lerp(sFrom.phi, sTo.phi, e),
        sFrom.theta + dTheta * e,
      );
      controls.target.lerpVectors(tween.fromT, tween.toT, e);
      camera.position.setFromSpherical(s).add(controls.target);
      camera.lookAt(controls.target);
      if (k >= 1) tween = null;
    }
    const moved = controls.update();
    return !!tween || moved || controls.autoRotate;
  };

  return {controls, update, reset, goTo, setAuto: (on) => (controls.autoRotate = on), dispose: () => controls.dispose()};
}
