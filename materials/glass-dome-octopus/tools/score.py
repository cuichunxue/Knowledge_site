"""Weighted quality score (internal QA index, NOT an objective image-similarity measure).

usage: python3 tools/score.py            -> prints the table for before / round1 / round2 and writes quality/score.json

Each item is 0-100. Parts marked (m) are computed from the measurements in quality/<build>.json; parts marked (j)
are judgements made by looking at the renders against the reference, fixed here with their reasons so the score
can be re-run and audited. closeness(d) = max(0, 100 - 2|d|) for a difference of d percent.
"""
import json

WEIGHTS = [15, 15, 10, 10, 10, 10, 5, 5, 5, 5, 5, 5]
NAMES = [
    '本体と触手の全体プロポーション', '8本の触手の形状・配置', '触手の関節・機械構造', 'ガラスドームの透明感',
    'AIコアと内部構造', '白い装甲の形状・分割', '前方カメラの再現度', '金属・ガラス・装甲の質感',
    '緑色発光の表現', '機械部品の密度・精密感', '照明・影・構図', '360度表示時の破綻の有無',
]

# arms whose placement matches the reference layout (2 raised behind, 2 out to the sides at mid height,
# 4 down / toward the viewer); counted on the hero render
PLACEMENT = {'before': 5, 'round1': 8, 'round2': 8}

# (j) judgements, 0..their share of the item; reasons in QUALITY_REPORT.md
J = {
    'before': {
        'tip_penalty': 0,   # item 2: curl shape vs reference (deduction)
        'joint_layers': 20, 'core_glow': 15, 'interior': 30, 'panels': 30, 'cam_pos': 20,
        'materials': 75, 'detail': 25, 'shadow': 25, 'turn': 90, 'dome_clear': 45,
    },
    'round1': {
        'tip_penalty': 15, 'joint_layers': 30, 'core_glow': 15, 'interior': 30, 'panels': 34, 'cam_pos': 26,
        'materials': 76, 'detail': 28, 'shadow': 28, 'turn': 85, 'dome_clear': 45,
    },
    'round2': {
        'tip_penalty': 10, 'joint_layers': 35, 'core_glow': 20, 'interior': 32, 'panels': 38, 'cam_pos': 26,
        'materials': 78, 'detail': 30, 'shadow': 32, 'turn': 85, 'dome_clear': 45,
    },
}


def closeness(d):
    return max(0.0, 100.0 - 2.0 * abs(d))


def score(build):
    q = json.load(open(f'quality/{build}.json'))
    r, c, j = q['ratios'], q['colour'], J[build]
    d = lambda k: r[k]['diff_pct']
    pct = lambda k: (c[k]['render_over_ref'] - 1) * 100
    lengths = [closeness(d(k)) for k in r if k.startswith('tentacle length')]
    s = []
    # 1 (m) mean closeness: body/width, dome height, root, height/width, mean of the 3 path lengths
    s.append(sum([closeness(d('body / total width')), closeness(d('dome height / body')), closeness(d('tentacle root / body')),
                  closeness(d('total height / total width')), sum(lengths) / 3]) / 5)
    # 2 (m) 70 x placement share + 30 x curl closeness, (j) minus the tip-shape deduction
    s.append(70 * PLACEMENT[build] / 8 + 0.3 * closeness(d('tip curl / body')) - j['tip_penalty'])
    # 3 (m/j) 25 segments 12-16 per arm + 25 rings & pins on every joint + (j) 0-50 layered, non-toy armour
    segs_ok = all(12 <= n <= 16 for n in q['segments'].values())
    s.append(25 * segs_ok + 25 + j['joint_layers'])
    # 4 (m) 50 x dome-height closeness + (j) 0-50 clear glass with the interior readable
    s.append(0.5 * closeness(d('dome height / body')) + j['dome_clear'])
    # 5 (j) 30 core visible from the hero view + 0-30 glow + 0-40 interior richness
    s.append(30 + j['core_glow'] + j['interior'])
    # 6 (m) 50 x white-share closeness + (j) 0-50 panel division
    s.append(0.5 * closeness(pct('white')) + j['panels'])
    # 7 (m) 70 x mean closeness of housing and lens + (j) 0-30 position / protrusion
    s.append(0.7 * (closeness(d('camera housing / body')) + closeness(d('camera lens / body'))) / 2 + j['cam_pos'])
    # 8 (j)
    s.append(j['materials'])
    # 9 (m) green share closeness
    s.append(closeness(pct('green')))
    # 10 (m) 50 x dark-structure closeness + (j) 0-50 fine detail
    s.append(0.5 * closeness(pct('dark_structure')) + j['detail'])
    # 11 (m) 50 x height/width closeness + (j) 0-50 light and shadow
    s.append(0.5 * closeness(d('total height / total width')) + j['shadow'])
    # 12 (j) 360° check
    s.append(j['turn'])
    s = [round(min(100, max(0, x)), 1) for x in s]
    total = round(sum(x * w for x, w in zip(s, WEIGHTS)) / 100, 1)
    return s, total


if __name__ == '__main__':
    res = {}
    for b in ['before', 'round1', 'round2']:
        res[b] = score(b)
    print('No | item | weight | before | round1 | round2')
    for i, n in enumerate(NAMES):
        print(f'{i + 1} | {n} | {WEIGHTS[i]}% | ' + ' | '.join(str(res[b][0][i]) for b in res))
    print('total | | 100% | ' + ' | '.join(str(res[b][1]) for b in res))
    json.dump({b: {'items': v[0], 'total': v[1]} for b, v in res.items()}, open('quality/score.json', 'w'), indent=1)
