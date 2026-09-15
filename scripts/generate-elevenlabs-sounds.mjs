// Run from the repository root with Node 22+:
// node --env-file=.env.local scripts/generate-elevenlabs-sounds.mjs [--generate]
// Defaults to a dry run. Saved results are never overwritten or automatically retried.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'

const planIndex = process.argv.indexOf('--plan')
if (planIndex !== -1 && !process.argv[planIndex + 1]) throw new Error('--plan requires a path')
const planPath = planIndex === -1 ? 'assets/recipes/elevenlabs-road-voices.json' : process.argv[planIndex + 1]
const plan = JSON.parse(readFileSync(planPath, 'utf8'))
const out = plan.output ?? '.context/elevenlabs-road-v2'
const { jobs } = plan
if (jobs.some(job => job.kind === 'sfx' && job.body.text.length > 450)) throw new Error('SFX prompts must be at most 450 characters')
const totals = { calls: jobs.length, speechCharacters: jobs.filter(j => j.kind === 'voice').reduce((n,j) => n + j.body.text.length,0), sfxSeconds: jobs.filter(j => j.kind === 'sfx').reduce((n,j) => n+j.body.duration_seconds,0), musicSeconds: jobs.filter(j => j.kind === 'music').reduce((n,j) => n+j.body.music_length_ms/1000,0) }
if (totals.speechCharacters > 1800 || totals.sfxSeconds > Math.min(plan.maxSfxSeconds ?? 70, 180) || totals.musicSeconds > 0) throw new Error('Pilot size exceeded')
mkdirSync(out, { recursive: true })
writeFileSync(`${out}/plan.json`, JSON.stringify({ totals, jobs }, null, 2) + '\n')
console.log(JSON.stringify({ planned: totals }))
if (!process.argv.includes('--generate')) process.exit(0)
const key = process.env.ELEVENLABS_API_KEY?.trim()
if (!key) throw new Error('ELEVENLABS_API_KEY is not configured')
const clean = value => String(value).split(key).join('[REDACTED]').slice(0,800)
async function subscription() {
  try {
    const r = await fetch('https://api.elevenlabs.io/v1/user/subscription', { headers: { 'xi-api-key': key }, signal: AbortSignal.timeout(15000) })
    if (!r.ok) return { http: r.status }
    const s = await r.json()
    return { tier: s.tier, character_count: s.character_count, character_limit: s.character_limit }
  } catch { return { error: 'Usage lookup failed' } }
}
const blocked = new Set()
const before = await subscription()
for (const job of jobs) {
  const record = `${out}/${job.id}.json`
  if (existsSync(record) || existsSync(`${out}/${job.id}.mp3`)) { console.log(`${job.id}: previous result preserved`); continue }
  if (blocked.has(job.kind)) { console.log(`${job.id}: skipped after endpoint rejection`); continue }
  const result = { ...job, startedAt: new Date().toISOString(), status: 'pending' }
  writeFileSync(record, JSON.stringify(result, null, 2) + '\n')
  console.log(`${job.id}: generating`)
  try {
    const format = job.kind === 'music' ? 'mp3_48000_128' : 'mp3_44100_128'
    const r = await fetch(`https://api.elevenlabs.io${job.path}?output_format=${format}`, { method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json' }, body: JSON.stringify(job.body), signal: AbortSignal.timeout(240000) })
    result.http = r.status
    result.responseMetadata = Object.fromEntries([...r.headers].filter(([name]) => /^(request-id|history-item-id|character-cost|song-id)$/.test(name)))
    if (!r.ok) {
      let error; try { error = await r.json() } catch { error = {} }
      result.status = 'rejected'
      result.error = clean(JSON.stringify(error.detail ?? { status: r.status }))
      blocked.add(job.kind)
      console.log(`${job.id}: HTTP ${r.status} ${result.error}`)
    } else {
      const data = Buffer.from(await r.arrayBuffer())
      if (!r.headers.get('content-type')?.startsWith('audio/') || data.length < 128) throw new Error('Unexpected audio response')
      writeFileSync(`${out}/${job.id}.mp3`, data, { flag: 'wx' })
      result.status = 'generated'
      result.bytes = data.length
      result.sha256 = createHash('sha256').update(data).digest('hex')
      console.log(`${job.id}: saved (${data.length} bytes)`)
    }
  } catch {
    result.status = 'uncertain'
    result.error = 'Request or save failed; inspect provider history before retrying to avoid duplicate billing.'
    blocked.add(job.kind)
    console.log(`${job.id}: ${result.error}`)
  }
  result.finishedAt = new Date().toISOString()
  writeFileSync(record, JSON.stringify(result, null, 2) + '\n')
}
const after = await subscription()
writeFileSync(`${out}/usage.json`, JSON.stringify({ before, after }, null, 2) + '\n')
console.log(JSON.stringify({ usage: { before, after } }))
