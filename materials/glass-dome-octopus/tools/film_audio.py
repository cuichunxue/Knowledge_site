"""Sound for the 15 s film, built on the same timeline as src/film.js (standard library + numpy only).

usage: python3 tools/film_audio.py <out.wav>
Then master to -14 LUFS with ffmpeg loudnorm (see tools/film_encode.sh).

Layers
- pad: a slow A-minor-ish chord that swells in, lifts during the explode and settles at the end
- ticks: a quiet mechanical tick on every beat (120 BPM)
- unlock clicks + servo whirs at each part's unlock (BEATS in film.js)
- the explode cascade: one click per part at the moment its window starts (PARTS windows in explosion.js,
  mapped onto the film's explode from 8.0 s to 11.6 s), under a rising noise sweep
- the reassembly: a reversed sweep and a final clunk at 14.4 s
"""
import sys
import wave

import numpy as np

SR = 48000
DUR = 15.0
N = int(SR * DUR)
t = np.arange(N) / SR
rng = np.random.default_rng(7)

# from src/film.js
UNLOCK = [2.0, 3.6, 5.8]
LIFT = [2.15, 3.75, 6.0]
EXPLODE = (8.0, 11.6)
ASSEMBLE = (13.4, 14.4)
# window starts of the 15 parts in src/explosion.js (P01, P04, P03, P05, P02, arms x8, P06, P15)
WINDOW_STARTS = [0.0, 0.1, 0.2, 0.3, 0.4] + [0.5 + 0.03 * i for i in range(8)] + [0.8, 0.88]


def env(start, attack, decay, length=None):
    e = np.zeros(N)
    i0 = int(start * SR)
    n = int((length or attack + decay * 6) * SR)
    k = np.arange(min(n, N - i0)) / SR
    e[i0:i0 + len(k)] = np.minimum(1, k / max(attack, 1e-4)) * np.exp(-np.maximum(0, k - attack) / decay)
    return e


def smooth(x, a, b):
    y = np.clip((x - a) / (b - a), 0, 1)
    return y * y * (3 - 2 * y)


def lowpass(x, cutoff):
    # one-pole low-pass, cutoff in Hz (scalar)
    a = np.exp(-2 * np.pi * cutoff / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc = (1 - a) * x[i] + a * acc
        y[i] = acc
    return y


L = np.zeros(N)
R = np.zeros(N)

# ---- pad
chord = [110.0, 164.81, 220.0, 261.63, 329.63]
pad = sum(np.sin(2 * np.pi * f * t + 0.7 * k) * (0.55 if k else 1.0) for k, f in enumerate(chord))
pad += 0.35 * np.sin(2 * np.pi * 55.0 * t)
lfo = 0.75 + 0.25 * np.sin(2 * np.pi * 0.23 * t)
pad_env = smooth(t, 0, 1.6) * (0.55 + 0.45 * smooth(t, 7.6, 11.6)) * (1 - 0.6 * smooth(t, 12.0, 13.4)) * (1 - smooth(t, 14.3, 15.0) * 0.85)
pad = pad * lfo * pad_env * 0.05
L += pad
R += np.roll(pad, 240)  # a touch of width

# ---- ticks (120 BPM), quieter while the titles are up
for b in np.arange(0.5, DUR, 0.5):
    e = env(b, 0.0008, 0.012, 0.08)
    tick = np.sin(2 * np.pi * 2400 * t) * e * 0.05
    pan = 0.5 + 0.3 * np.sin(b)
    L += tick * (1 - pan)
    R += tick * pan


def click(at, gain=0.35, pitch=1.0, pan=0.5):
    e = env(at, 0.0005, 0.035, 0.3)
    s = (np.sin(2 * np.pi * 3100 * pitch * t) + 0.6 * np.sin(2 * np.pi * 4700 * pitch * t) + 0.4 * np.sin(2 * np.pi * 1800 * pitch * t)) * e
    s += rng.standard_normal(N) * env(at, 0.0003, 0.006, 0.05) * 0.8
    global L, R
    L += s * gain * (1 - pan)
    R += s * gain * pan


def whir(start, length, f0, f1, gain=0.12):
    k = np.clip((t - start) / length, 0, 1)
    f = f0 + (f1 - f0) * k
    phase = 2 * np.pi * np.cumsum(f) / SR
    e = smooth(t, start, start + 0.08) * (1 - smooth(t, start + length - 0.25, start + length))
    s = (np.sin(phase) + 0.3 * np.sin(2 * phase)) * e * gain
    global L, R
    L += s
    R += s


# ---- the three solo parts: unlock click, then the servo
for i, (u, l) in enumerate(zip(UNLOCK, LIFT)):
    click(u, 0.32, 1.0 + 0.08 * i, 0.4 + 0.1 * i)
    click(u + 0.07, 0.2, 1.2, 0.6)
    whir(l, 1.1, 260 + 40 * i, 760 + 60 * i)

# ---- the explode cascade
a, b = EXPLODE
for i, w in enumerate(WINDOW_STARTS):
    click(a + w * (b - a), 0.22, 0.85 + 0.03 * i, 0.15 + 0.7 * (i % 5) / 4)
noise = rng.standard_normal(N)
sweep_env = smooth(t, a, b - 0.6) * (1 - smooth(t, b - 0.2, b + 0.5))
sweep = lowpass(noise * sweep_env, 1800) * 0.5
L += sweep
R += np.roll(sweep, 360)

# ---- the reassembly: a reversed sweep into a clunk
a, b = ASSEMBLE
rev_env = smooth(t, a, b - 0.05) * (1 - smooth(t, b - 0.02, b + 0.05))
rev = lowpass(noise[::-1] * rev_env, 2600) * 0.55
L += rev
R += rev
thump = np.sin(2 * np.pi * 62 * t) * env(b, 0.002, 0.09, 0.6) * 0.6
ping = np.sin(2 * np.pi * 1320 * t) * env(b + 0.01, 0.001, 0.35, 2.0) * 0.12
L += thump + ping
R += thump + ping
click(b, 0.3, 0.7, 0.5)

# ---- title shimmer
for at in (0.3, 14.4):
    bell = sum(np.sin(2 * np.pi * f * t) / (k + 1) for k, f in enumerate([880, 1318.5, 1760])) * env(at, 0.004, 0.6, 3.0) * 0.07
    L += bell
    R += bell

# fades and a gentle limiter
fade = smooth(t, 0, 0.05) * (1 - smooth(t, DUR - 0.3, DUR))
L *= fade
R *= fade
peak = max(np.abs(L).max(), np.abs(R).max())
L /= peak / 0.89
R /= peak / 0.89

out = np.stack([L, R], axis=1)
with wave.open(sys.argv[1], 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((out * 32767).astype('<i2').tobytes())
print('wrote', sys.argv[1], f'{DUR}s')
