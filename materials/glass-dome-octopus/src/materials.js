// Materials (PBR). Palette and recipes follow Nyxera0x/cutaway's parts.js (MIT), with the accent switched to
// emerald green and a glass dome that can fall back to plain alpha blending on weak GPUs.
import * as THREE from 'three';

export const PAL = {
  white: '#f3f2ee',
  green: '#19e08a',
  greenDeep: '#0fae68',
  graphite: '#101215',
  titanium: '#262a2f',
  black: '#07080a',
  steel: '#c9cdd2',
};

/**
 * @param {{transmission:boolean}} tier
 */
export function makeMaterials(tier) {
  const phys = (o) => new THREE.MeshPhysicalMaterial(o);
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const m = {
    // white armour: soft base under a hard clear coat, so the softboxes sit on it as crisp bars
    shell: phys({color: PAL.white, roughness: 0.32, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05}),
    // inner faces / underside of plates, a shade darker and matte
    shellIn: phys({color: '#d9d6d0', roughness: 0.6, metalness: 0, side: THREE.DoubleSide}),
    graphite: std({color: PAL.graphite, roughness: 0.5, metalness: 0.55, envMapIntensity: 0.32}),
    titanium: std({color: PAL.titanium, roughness: 0.34, metalness: 0.8, envMapIntensity: 0.45}),
    black: phys({color: PAL.black, roughness: 0.45, metalness: 0.1, clearcoat: 0.4, clearcoatRoughness: 0.25, envMapIntensity: 0.35}),
    rubber: std({color: '#101113', roughness: 0.75, metalness: 0, envMapIntensity: 0.4}),
    steel: std({color: PAL.steel, roughness: 0.2, metalness: 1}),
    brass: std({color: '#9a8656', roughness: 0.32, metalness: 1}),
    // camera lens: deep black under a glossy coat; reflections carry the read
    lens: phys({color: '#020203', roughness: 0.04, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.6}),
    // emissive accents: the core, rings, pad rims
    core: std({color: '#000000', emissive: PAL.green, emissiveIntensity: 3.2, toneMapped: false}),
    glow: std({color: '#0a3a24', emissive: PAL.green, emissiveIntensity: 2.2, roughness: 0.4, toneMapped: false}),
    glowSoft: std({color: '#0a3a24', emissive: PAL.greenDeep, emissiveIntensity: 0.9, roughness: 0.4}),
    // green painted accent (not emissive): rims and edge lines
    greenPaint: phys({color: '#16b874', roughness: 0.3, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08}),
  };
  // the dome: real transmission where the GPU can afford it, else alpha blending with a strong clear coat
  m.glass = tier.transmission
    ? phys({color: '#ffffff', roughness: 0, metalness: 0, transmission: 1, thickness: 0.04, ior: 1.33,
        specularIntensity: 0.3, clearcoat: 0.35, clearcoatRoughness: 0.0, envMapIntensity: 0.16, side: THREE.FrontSide})
    : phys({color: '#f4f8f7', roughness: 0.03, metalness: 0, transparent: true, opacity: 0.1, depthWrite: false,
        clearcoat: 0.35, clearcoatRoughness: 0.02, envMapIntensity: 0.25});
  return m;
}

/** A soft additive glow sprite (radial gradient), for the core's halo. */
export function glowSprite(color = PAL.green, size = 1, opacity = 0.55) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({map: tex, color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false}));
  s.scale.setScalar(size);
  return s;
}

/** Text decal (e.g. the "VT-08" mark on the side plate) as a transparent canvas texture. */
export function textDecal(text, w = 512, h = 160, color = '#2c3036') {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = color;
  g.font = `600 ${Math.round(h * 0.62)}px "Arial Narrow", Arial, sans-serif`;
  g.textBaseline = 'middle';
  g.fillText(text, w * 0.04, h * 0.54);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return new THREE.MeshBasicMaterial({map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4});
}
