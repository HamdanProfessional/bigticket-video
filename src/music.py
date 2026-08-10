"""
Procedural score generator.

Synthesises an original warm/soft ambient bed from the director's music spec, so
every video gets a track in its own key and tempo with no licensing attached.
The spec's `cuts` are used to place soft bell accents on the edit points.

  python src/music.py spec.json out.wav
"""
import json
import math
import sys

import numpy as np

SR = 44100

# --------------------------------------------------------------------- theory
NOTES = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6,
         "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}

# Voicings as semitone offsets from the chord root. Chosen to be open and airy
# rather than dense — close voicings sound muddy under speech-free video.
PROGRESSIONS = {
    # I - vi - IV - V with major-7th colour: the "warm and safe" default.
    "majorSeventh": {
        "degrees": [0, 9, 5, 7],
        "voicings": [[0, 4, 7, 11, 14], [0, 3, 7, 10, 14], [0, 4, 7, 11, 14], [0, 4, 7, 9, 14]],
    },
    # i - VI - III - VII, ninths on top: reflective, a touch cinematic.
    "minorNinth": {
        "degrees": [0, 8, 3, 10],
        "voicings": [[0, 3, 7, 10, 14], [0, 4, 7, 11, 14], [0, 4, 7, 11, 14], [0, 4, 7, 10, 14]],
    },
    # Pentatonic-leaning and bright: playful/energetic moods.
    "majorPent": {
        "degrees": [0, 7, 9, 5],
        "voicings": [[0, 4, 7, 14], [0, 4, 7, 12], [0, 3, 7, 14], [0, 4, 7, 11]],
    },
}


def midi_to_hz(m):
    return 440.0 * (2.0 ** ((m - 69) / 12.0))


# ------------------------------------------------------------------ synthesis
def pad_voice(freq, dur, warmth, rng, detune=0.006):
    """A soft pad note: a few detuned partials with a slow swell."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)

    # Higher warmth = fewer/quieter upper harmonics = rounder tone.
    n_harm = max(2, int(6 - warmth * 3))
    for h in range(1, n_harm + 1):
        amp = (1.0 / (h ** (1.4 + warmth)))
        for d in (-detune, 0.0, detune):
            phase = rng.uniform(0, 2 * math.pi)
            # Slow drift keeps the pad from sounding static/synthetic.
            drift = 1.0 + 0.0009 * np.sin(2 * math.pi * rng.uniform(0.05, 0.16) * t + phase)
            out += amp * np.sin(2 * math.pi * freq * h * drift * t + phase)

    # Gentle tremolo, very shallow.
    out *= 1.0 + 0.05 * np.sin(2 * math.pi * rng.uniform(0.12, 0.3) * t)
    return out / (n_harm * 3)


def env_swell(n, attack, release, sustain_level=1.0):
    """Long attack / long release envelope, cosine-shaped so there are no clicks."""
    e = np.ones(n) * sustain_level
    a = min(int(attack * SR), n)
    r = min(int(release * SR), n - a) if n > a else 0
    if a > 0:
        e[:a] = sustain_level * (0.5 - 0.5 * np.cos(np.linspace(0, math.pi, a)))
    if r > 0:
        e[n - r:] = sustain_level * (0.5 + 0.5 * np.cos(np.linspace(0, math.pi, r)))
    return e


def bell(freq, dur, rng):
    """Soft struck tone for edit accents — sine plus a quiet octave, fast decay."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    tone = np.sin(2 * math.pi * freq * t) + 0.28 * np.sin(2 * math.pi * freq * 2.01 * t)
    tone += 0.12 * np.sin(2 * math.pi * freq * 3.02 * t)
    return tone * np.exp(-t * 3.2) * 0.33


def one_pole_lowpass(x, cutoff):
    """Warmth filter: first-order roll-off applied in the frequency domain.

    Equivalent in character to a one-pole IIR but vectorised — a per-sample
    Python loop over a few million samples would dominate the whole render.
    """
    n = len(x)
    spec = np.fft.rfft(x)
    freqs = np.fft.rfftfreq(n, 1.0 / SR)
    spec *= 1.0 / (1.0 + (freqs / max(cutoff, 1.0)) ** 2) ** 0.5
    return np.fft.irfft(spec, n)


def fft_convolve(x, ir):
    """Overlap-free FFT convolution — direct convolution at this length is
    hopeless (millions of samples against a 100k-tap IR)."""
    n = len(x) + len(ir) - 1
    nfft = 1 << (n - 1).bit_length()
    out = np.fft.irfft(np.fft.rfft(x, nfft) * np.fft.rfft(ir, nfft), nfft)
    return out[: len(x)]


def reverb(x, seconds=2.8, mix=0.36, rng=None):
    """Convolution reverb against a synthetic exponentially-decaying IR."""
    n = int(seconds * SR)
    noise = rng.standard_normal(n)
    ir = noise * np.exp(-np.linspace(0, 7.0, n))
    # Pre-delay + tame the IR's high end so the tail sits behind the pad.
    ir = one_pole_lowpass(ir, 2600)
    ir[: int(0.02 * SR)] = 0
    ir /= np.abs(ir).sum() + 1e-9
    wet = fft_convolve(x, ir)
    peak = np.abs(wet).max()
    if peak > 0:
        wet *= np.abs(x).max() / peak
    return (1 - mix) * x + mix * wet


# ----------------------------------------------------------------------- main
def generate(spec):
    dur = float(spec.get("duration", 30.0)) + 1.5  # tail past the last frame
    tempo = float(spec.get("tempo", 70))
    warmth = float(spec.get("warmth", 0.85))
    density = float(spec.get("density", 0.4))
    key = spec.get("key", "F")
    scale = spec.get("scale", "majorSeventh")
    rng = np.random.default_rng(int(spec.get("seed", 0)) & 0xFFFFFFFF)

    root_pc = NOTES.get(key, 5)
    prog = PROGRESSIONS.get(scale, PROGRESSIONS["majorSeventh"])
    bar = 4 * 60.0 / tempo
    chord_len = bar * 2  # two bars per chord: slow harmonic rhythm

    n_total = int(dur * SR)
    mix = np.zeros(n_total)

    # --- pad + bass ------------------------------------------------------
    i = 0
    start = 0.0
    while start < dur:
        deg = prog["degrees"][i % len(prog["degrees"])]
        voicing = prog["voicings"][i % len(prog["voicings"])]
        chord_root = 48 + root_pc + deg  # around C3

        # Overlap chords so they bleed into each other — no gaps, no pumping.
        note_dur = chord_len * 1.55
        s0 = int(start * SR)
        n = min(int(note_dur * SR), n_total - s0)
        if n <= 0:
            break

        env = env_swell(n, attack=chord_len * 0.42, release=chord_len * 0.75, sustain_level=1.0)
        for k, semi in enumerate(voicing):
            freq = midi_to_hz(chord_root + semi)
            # Upper voices quieter, and thinned out at low density.
            gain = 0.62 / (1 + 0.55 * k)
            if k >= 3 and rng.random() > 0.35 + density:
                continue
            v = pad_voice(freq, n / SR, warmth, rng)
            # pad_voice builds its own time base, so float rounding can leave it
            # a sample either side of n. Trim to whatever both actually have.
            m = min(n, len(v))
            mix[s0:s0 + m] += v[:m] * env[:m] * gain

        # Sub bass, one octave down, softer attack still.
        bfreq = midi_to_hz(chord_root - 12)
        bn = min(int(chord_len * 1.2 * SR), n_total - s0)
        bt = np.arange(bn) / SR
        bass = np.sin(2 * math.pi * bfreq * bt) * 0.34
        bass += np.sin(2 * math.pi * bfreq * 2 * bt) * 0.06
        mix[s0:s0 + bn] += bass * env_swell(bn, chord_len * 0.35, chord_len * 0.5)

        start += chord_len
        i += 1

    # --- bell accents on the edit points ---------------------------------
    cuts = [float(c) for c in spec.get("cuts", [])]
    for idx, c in enumerate(cuts):
        if c <= 0.4 or c >= dur - 0.6:
            continue
        if rng.random() > 0.35 + density * 0.5:
            continue
        deg = prog["degrees"][(idx) % len(prog["degrees"])]
        voicing = prog["voicings"][(idx) % len(prog["voicings"])]
        semi = int(rng.choice(voicing[1:] if len(voicing) > 1 else voicing))
        freq = midi_to_hz(72 + root_pc + deg + semi)
        b = bell(freq, 2.4, rng)
        s0 = int((c - 0.06) * SR)
        n = min(len(b), n_total - s0)
        if n > 0:
            mix[s0:s0 + n] += b[:n] * 0.5

    # --- air: a breath of filtered noise under everything -----------------
    air = rng.standard_normal(n_total) * 0.012
    air = one_pole_lowpass(air, 900)
    air *= 0.5 + 0.5 * np.sin(2 * math.pi * 0.05 * np.arange(n_total) / SR)
    mix += air

    # --- master ----------------------------------------------------------
    mix = one_pole_lowpass(mix, 3200 + (1 - warmth) * 5000)
    mix = reverb(mix, seconds=2.9, mix=0.30 + warmth * 0.12, rng=rng)

    # Soft saturation instead of hard limiting keeps it gentle.
    peak = np.abs(mix).max()
    if peak > 0:
        mix = mix / peak * 0.92
    mix = np.tanh(mix * 1.25) / math.tanh(1.25)

    # Programme fades.
    fi = int(1.6 * SR)
    fo = int(2.4 * SR)
    mix[:fi] *= np.linspace(0, 1, fi) ** 1.5
    mix[-fo:] *= np.linspace(1, 0, fo) ** 1.4
    mix *= 0.82

    stereo = np.stack([mix, np.roll(mix, 220)], axis=1)  # tiny Haas width
    return stereo


def write_wav(path, data):
    import wave
    pcm = np.clip(data, -1, 1)
    pcm = (pcm * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


if __name__ == "__main__":
    spec_path, out_path = sys.argv[1], sys.argv[2]
    with open(spec_path, "r", encoding="utf-8") as fh:
        spec = json.load(fh)
    audio = generate(spec)
    write_wav(out_path, audio)
    print(f"wrote {out_path}  ({len(audio) / SR:.1f}s, {spec.get('key')} {spec.get('scale')} @ {spec.get('tempo')}bpm)")
