"""Render the video narration to public/narration/<key>.webm with the Kokoro neural voice.

Reads scripts/.narration.json (written by scripts/gen-narration.test.ts), renders only the
sentences that have no file yet, and deletes files no video uses any more.

Needs Python 3.10-3.12 with: torch (CUDA build for speed), kokoro>=0.9.4, soundfile; and ffmpeg on PATH.
Run with: npm run narration
Faster: run several shards side by side, e.g. `python scripts/narrate.py 0/3`, `1/3`, `2/3`.
"""
import json
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from kokoro import KPipeline

VOICE = 'af_heart'  # Kokoro's most natural, expressive voice
SPEED = 1.08  # a touch brisk, for an energetic delivery
OUT = Path('public/narration')
RATE = 24000

lines = json.loads(Path('scripts/.narration.json').read_text(encoding='utf8'))
OUT.mkdir(parents=True, exist_ok=True)
shard, shards = (int(v) for v in (sys.argv[1] if len(sys.argv) > 1 else '0/1').split('/'))
if shards == 1:
    wanted = {x['key'] for x in lines}
    for f in OUT.glob('*.webm'):
        if f.stem not in wanted:
            f.unlink()
lines = lines[shard::shards]

todo = [x for x in lines if not (OUT / f"{x['key']}.webm").exists()]
print(f'{len(lines)} sentences, {len(todo)} to render', flush=True)
pipe = KPipeline(lang_code='a', repo_id='hexgrad/Kokoro-82M')

def encode(key: str, pcm: bytes) -> None:
    tmp = OUT / f'{key}.tmp.webm'
    subprocess.run(
        ['ffmpeg', '-v', 'error', '-y', '-f', 's16le', '-ar', str(RATE), '-ac', '1', '-i', '-',
         '-af', 'loudnorm=I=-17:TP=-1.5:LRA=11', '-ar', '24000', '-c:a', 'libopus', '-b:a', '18k', '-application', 'voip', str(tmp)],
        input=pcm, check=True,
    )
    tmp.replace(OUT / f'{key}.webm')


# speech runs on the GPU while ffmpeg encodes earlier sentences on other cores
with ThreadPoolExecutor(4) as pool:
    jobs = []
    for n, x in enumerate(todo, 1):
        parts = [audio.numpy() for _, _, audio in pipe(x['text'], voice=VOICE, speed=SPEED) if audio is not None]
        if not parts:
            print('no audio for:', x['text'], file=sys.stderr)
            continue
        pcm = (np.clip(np.concatenate(parts), -1, 1) * 32767).astype('<i2').tobytes()
        jobs.append(pool.submit(encode, x['key'], pcm))
        if n % 200 == 0:
            print(f'{n}/{len(todo)}', flush=True)
    for j in jobs:
        j.result()
print('done', flush=True)
