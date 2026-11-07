"""Measure an image region: colour-area shares and dark density (luma < 80).
usage: python3 measure.py image.png x0 y0 x1 y1 [mask_bg]
Prints JSON. Background = near-white low-saturation pixels; shares are over the object mask."""
import sys, json
import numpy as np
from PIL import Image

def measure(path, box):
    im = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    x0, y0, x1, y1 = box
    a = im[y0:y1, x0:x1]
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    luma = 0.299 * r + 0.587 * g + 0.114 * b
    mx, mn = a.max(-1), a.min(-1)
    sat = (mx - mn) / np.maximum(mx, 1)
    bg = (luma > 222) & (sat < 0.06)
    obj = ~bg
    n = obj.sum()
    dark = (luma < 80) & obj
    green = (g > r + 35) & (g > b - 10) & obj
    white = (luma > 175) & (sat < 0.12) & obj
    metal = obj & ~dark & ~green & ~white
    ys, xs = np.nonzero(obj)
    return {
        'bbox': [int(xs.min()) + x0, int(ys.min()) + y0, int(xs.max()) + x0, int(ys.max()) + y0],
        'object_px': int(n),
        'fill_of_bbox': round(float(n) / a.shape[0] / a.shape[1], 3),
        'dark_share_bbox': round(float(((luma < 80)).mean()), 3),
        'dark': round(float(dark.sum() / n), 3),
        'green': round(float(green.sum() / n), 3),
        'white': round(float(white.sum() / n), 3),
        'metal_grey': round(float(metal.sum() / n), 3),
    }

if __name__ == '__main__':
    p = sys.argv[1]
    box = list(map(int, sys.argv[2:6]))
    print(json.dumps(measure(p, box), ensure_ascii=False))
