"""Import an audition plan once generation finishes; requires ffmpeg, no Python packages.

Run from repository root: python3 scripts/import-elevenlabs-sounds.py [--plan path]
Original responses remain in .context for review. No API calls are made here.
"""
import argparse
import array
import json
import math
from pathlib import Path
import subprocess
import wave

parser = argparse.ArgumentParser()
parser.add_argument('--plan', default='assets/recipes/elevenlabs-road-voices.json')
args = parser.parse_args()
plan = json.loads(Path(args.plan).read_text())
version = plan['version']
source = Path(plan.get('output', '.context/elevenlabs-road-v2'))
destination = Path(f'public/sounds/elevenlabs/v{version}')
destination.mkdir(parents=True, exist_ok=True)
catalog_path = Path('assets/recipes/elevenlabs-audition.json')
catalog = json.loads(catalog_path.read_text())
ids = {j['id'] for j in plan['jobs']}
# Keep earlier auditions unless this plan explicitly replaces their character.
sounds = [s for s in catalog['sounds'] if s['id'] not in ids and s['id'] not in plan.get('replaceSoundIds', []) and s.get('character') not in plan.get('replaceCharacters', [])]
for job in plan['jobs']:
    source_id = job.get('sourceId', job['id'])
    record = json.loads((source / (source_id + '.json')).read_text())
    if record['status'] != 'generated':
        raise RuntimeError('Missing generation: ' + job['id'])
    pitch = 2 ** (job.get('pitchSemitones', 0) / 12)
    filters = f'asetrate=44100*{pitch},aresample=22050,atempo={job.get("tempo", 1)/pitch}'
    if 'trimStart' in job:
        filters += f',atrim=start={job["trimStart"]}:end={job["trimEnd"]},asetpts=PTS-STARTPTS'
    if job.get('audioFilter'):
        filters += ',' + job['audioFilter']
    if job.get('mix'):
        command = ['ffmpeg', '-v', 'error']
        graph = []
        for i, event in enumerate(job['mix']):
            command += ['-i', 'public' + event['url']]
            graph.append(f'[{i}:a]adelay={round(event["at"]*1000)}:all=1[s{i}]')
        inputs = ''.join(f'[s{i}]' for i in range(len(job['mix'])))
        mix_filters = f'atempo={job.get("tempo", 1)}' + (',' + job['audioFilter'] if job.get('audioFilter') else '')
        graph.append(f'{inputs}amix=inputs={len(job["mix"])}:normalize=0,apad,atrim=duration=30,{mix_filters}[out]')
        raw = subprocess.check_output(command + ['-filter_complex', ';'.join(graph), '-map', '[out]', '-ac', '1', '-ar', '22050', '-f', 'f32le', '-'])
    else:
        raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(source / (source_id + '.mp3')), '-af', filters, '-ac', '1', '-ar', '22050', '-f', 'f32le', '-'])
    samples = array.array('f', raw)
    if job['kind'] == 'voice' and job.get('trimSilence', True):
        # Trim only outer silence; retain 100 ms around detected speech.
        window = 441
        active = [i for i in range(0, len(samples), window) if math.sqrt(sum(x*x for x in samples[i:i+window])/len(samples[i:i+window])) > 0.006]
        if not active:
            raise RuntimeError('Silent voice: ' + job['id'])
        samples = samples[max(0, active[0]-2205):min(len(samples), active[-1]+window+2205)]
    if job.get('loop'):
        # Overlap the boundary so the static ambience can repeat without a click.
        overlap = 2205
        blend = array.array('f', (samples[-overlap+i]*(1-i/overlap) + samples[i]*(i/overlap) for i in range(overlap)))
        samples = blend + samples[overlap:-overlap]
    rms = math.sqrt(sum(x*x for x in samples)/len(samples))
    peak = max(abs(x) for x in samples)
    target_db = job.get('targetDb', -20 if job['kind'] == 'voice' else -25)
    peak_limit_db = job.get('peakLimitDb', -3)
    gain = min(10 ** (target_db/20)/max(rms, 1e-9), 10 ** (peak_limit_db/20)/max(peak, 1e-9))
    if job['kind'] == 'sfx':
        # Quiet model outputs must not have their noise floor amplified.
        gain = min(gain, 10 ** (job.get('maxGainDb', 6)/20))
    pcm = array.array('h', (round(x*gain*32767) for x in samples))
    output = destination / (job['id'] + '.wav')
    with wave.open(str(output), 'wb') as wav:
        wav.setparams((1, 2, 22050, 0, 'NONE', 'not compressed'))
        wav.writeframes(pcm.tobytes())
    sound = {key: value for key, value in job.items() if key not in ('path', 'body')}
    sound.update(peakDb=round(20*math.log10(max(peak*gain, 1e-9)), 2), rmsDb=round(20*math.log10(max(rms*gain, 1e-9)), 2), url=f'/sounds/elevenlabs/v{version}/' + output.name, duration=round(len(samples)/22050, 3), gainDb=round(20*math.log10(gain), 2), model=job['body']['model_id'], prompt=job['body']['text'], loop=job.get('loop', False))
    sounds.append(sound)
    print(f'{job["id"]}: {sound["duration"]}s, gain {sound["gainDb"]}dB')
for sound in sounds:
    variant = plan.get('selectionVariants', {}).get(sound.get('character'))
    if variant:
        sound['response'] = 'select' if sound.get('variant') == variant else 'comparison'
        if sound.get('variant') == variant:
            sound['description'] = variant.title() + ' influence · current game voice'
catalog.update(version=max(catalog['version'], version), sounds=sounds)
catalog_path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n')
