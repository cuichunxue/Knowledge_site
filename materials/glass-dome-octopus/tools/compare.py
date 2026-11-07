"""Compare one render against the reference picture: shape ratios and colour / darkness shares.

usage: python3 tools/compare.py <render_dir> [label]
  <render_dir> holds hero.png, mask-all.png, mask-body.png and measure.json from tools/measure_render.mjs.
Prints a JSON report and writes <render_dir>/compare.json.

Reference values
- Shape: read by hand off the reference with a 50 px grid (assets/reference.png, 1672x941), +-5 px for edges,
  +-10 % for tentacle paths (they are traced as polylines through segment centres). See QUALITY_REPORT.md.
- Colour: the robot's pixels in x340-1335, y95-735, background (near-white, low saturation) and the three
  annotation labels that overlap the robot removed.
Render values
- Shape: from measure.json (the model's own geometry projected with the hero camera) and the silhouette mask.
- Colour: the robot's pixels exactly, from the silhouette mask (no background threshold needed).
"""
import json
import sys

import numpy as np
from PIL import Image

REF_PATH = 'assets/reference.png'
REF_BOX = (340, 95, 1335, 735)
REF_LABELS = [(515, 100, 665, 165), (940, 88, 1110, 145), (895, 635, 1065, 715)]  # annotation pills over the robot

# hand measurements on the reference, pixels (abs coordinates)
REF = {
    'bodyPx': 352,          # glass sphere width: x 660..1012
    'totalW': 995,          # tentacle tips: x 335..1330
    'totalH': 635,          # dome top y 95 .. lowest tip y 730
    'domeHPx': 215,         # glass top y 95 .. armour top edge at the sides y ~310
    'rootPx': 80,           # front tentacle at the body
    'cameraHousingPx': 125, # white housing round the camera
    'cameraLensPx': 82,     # black lens inside the green ring
    'curlPx': 85,           # upper-right raised tentacle's tip curl
    'lenB': 525, 'lenC': 425, 'lenF': 309,  # tentacle paths: upper right raised / left side / front centre
}
ARM_FOR = {'lenB': 'T1', 'lenC': 'T3', 'lenF': 'T5'}


def classes(rgb, mask):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    luma = 0.299 * r + 0.587 * g + 0.114 * b
    mx, mn = rgb.max(-1), rgb.min(-1)
    sat = (mx - mn) / np.maximum(mx, 1)
    n = mask.sum()
    green = (g > r + 35) & (g > b - 10) & mask
    dark = (luma < 80) & mask
    dark_struct = (luma < 110) & (sat < 0.3) & mask & ~green
    white = (luma > 175) & (sat < 0.12) & mask
    return {
        'object_px': int(n),
        'dark_density': round(float(dark.sum() / n), 3),
        'dark_structure': round(float(dark_struct.sum() / n), 3),
        'white': round(float(white.sum() / n), 3),
        'green': round(float(green.sum() / n), 3),
    }


def reference_colour():
    im = np.asarray(Image.open(REF_PATH).convert('RGB')).astype(np.float32)
    x0, y0, x1, y1 = REF_BOX
    a = im[y0:y1, x0:x1]
    luma = 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]
    sat = (a.max(-1) - a.min(-1)) / np.maximum(a.max(-1), 1)
    mask = ~((luma > 222) & (sat < 0.06))
    for lx0, ly0, lx1, ly1 in REF_LABELS:
        mask[max(0, ly0 - y0):max(0, ly1 - y0), max(0, lx0 - x0):max(0, lx1 - x0)] = False
    return classes(a, mask)


def render_report(d):
    m = json.load(open(f'{d}/measure.json'))
    sil = np.asarray(Image.open(f'{d}/mask-all.png').convert('L')) < 128
    ys, xs = np.nonzero(sil)
    totalW, totalH = int(xs.max() - xs.min()), int(ys.max() - ys.min())
    rgb = np.asarray(Image.open(f'{d}/hero.png').convert('RGB')).astype(np.float32)
    col = classes(rgb, sil)
    arms = m['arms']
    front = arms['T5']
    shape = {
        'bodyPx': m['bodyPx'], 'totalW': totalW, 'totalH': totalH, 'domeHPx': m['domeHPx'],
        'rootPx': front['rootPx'], 'cameraHousingPx': m['cameraHousingPx'], 'cameraLensPx': m['cameraLensPx'],
        'curlPx': arms['T1']['curlPx'],
        **{k: arms[v]['lengthPx'] for k, v in ARM_FOR.items()},
    }
    return shape, col, m


def ratios(s):
    b = s['bodyPx']
    return {
        'body / total width': s['bodyPx'] / s['totalW'],
        'dome height / body': s['domeHPx'] / b,
        'tentacle length / body (upper-right raised)': s['lenB'] / b,
        'tentacle length / body (left side)': s['lenC'] / b,
        'tentacle length / body (front)': s['lenF'] / b,
        'tentacle root / body': s['rootPx'] / b,
        'camera housing / body': s['cameraHousingPx'] / b,
        'camera lens / body': s['cameraLensPx'] / b,
        'tip curl / body': s['curlPx'] / b,
        'total height / total width': s['totalH'] / s['totalW'],
    }


if __name__ == '__main__':
    d = sys.argv[1]
    shape, col, m = render_report(d)
    rr, rv = ratios(REF), ratios(shape)
    out = {'ratios': {}, 'colour': {}, 'shape_px': shape}
    for k in rr:
        out['ratios'][k] = {'ref': round(rr[k], 3), 'render': round(rv[k], 3), 'diff_pct': round((rv[k] - rr[k]) / rr[k] * 100, 1)}
    rc = reference_colour()
    for k in ['dark_density', 'dark_structure', 'white', 'green']:
        out['colour'][k] = {'ref': rc[k], 'render': col[k], 'render_over_ref': round(col[k] / rc[k], 2)}
    out['segments'] = {a: v['segments'] for a, v in m['arms'].items()}
    out['stats'] = m.get('stats', {})
    json.dump(out, open(f'{d}/compare.json', 'w'), indent=1, ensure_ascii=False)
    print(json.dumps(out, ensure_ascii=False, indent=1))
