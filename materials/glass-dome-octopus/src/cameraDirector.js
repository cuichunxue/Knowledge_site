// STEP 4 — camera direction.
//
// Every part has its own viewpoint (explosion.js PARTS[].view): the dome from above at an angle, the core close and
// frontal, the camera in macro, the panels from the side, the gears from above into the inside, an arm from its
// side so the joints show, the jet from behind. The target is where the part ENDS UP: render() is a pure function
// of the state, so the director renders the opened state once, reads the part's marker, and renders back.
// Position and target are both interpolated (controls.goTo swings round the target). A drag by the user cancels
// the move at once (OrbitControls 'start' -> controls.js drops the tween): manual control always wins.
import * as THREE from 'three';

export function createDirector({camera, ctl, explosion, anim, markers, fitDist, homeView}) {
  const v = new THREE.Vector3();
  // portrait phones: back off so the part still fits the narrow width
  const aspectK = () => (camera.aspect < 1 ? Math.pow(1 / Math.max(0.5, camera.aspect), 0.75) : 1);

  /** Where the camera goes for part `id` (computed at the part's opened state). */
  function viewFor(id) {
    const part = explosion.parts.find((p) => p.id === id);
    const opened = {p: anim.state.p, ind: {...anim.state.ind, [id]: 1}};
    explosion.render(opened);
    markers[id].getWorldPosition(v);
    const target = v.clone();
    explosion.render(anim.state);
    const vw = part.view;
    let az = vw.az;
    if (vw.arm || vw.pads) {
      const arm = explosion.armOf(part.arm || 'T5');
      az = THREE.MathUtils.radToDeg(arm.azimuth) + vw.daz;
    }
    return {target, az, el: vw.el, dist: vw.dist * aspectK()};
  }

  return {
    viewFor,
    focus(id, ms = 1100) {
      ctl.goTo(viewFor(id), ms);
    },
    /** the whole exploded model in view */
    overview(ms = 1400) {
      ctl.goTo({target: new THREE.Vector3(0, 2.05, 0), az: 35, el: 22, dist: fitDist(1.2)}, ms);
    },
    home(ms = 1000) {
      ctl.goTo(homeView(), ms);
    },
  };
}
