import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { generateRelease, publish } from "./release.mjs"

const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()
const read = (cwd, name) => JSON.parse(readFileSync(join(cwd, name), "utf8"))
const write = (cwd, name, value) => writeFileSync(join(cwd, name), JSON.stringify(value, null, 2) + "\n")

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "pilgrimage-release-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const cwd = join(root, "work")
  mkdirSync(cwd)
  git(cwd, "init", "-b", "main")
  git(cwd, "config", "user.name", "Test Developer")
  git(cwd, "config", "user.email", "developer@example.test")
  git(cwd, "config", "commit.gpgsign", "false")
  mkdirSync(join(cwd, "lib"))
  write(cwd, "package.json", { name: "test", version: "0.0.11", dependencies: { example: "1.2.3" } })
  write(cwd, "package-lock.json", { version: "0.0.11", packages: { "": { version: "0.0.11" }, example: { version: "1.2.3" } } })
  git(cwd, "add", ".")
  git(cwd, "commit", "-m", "baseline")
  const base = git(cwd, "rev-parse", "HEAD")
  write(cwd, "lib/releases.json", { lastProcessedCommit: base, releaseCount: 0, releases: [
    { version: "0.0.14", title: "Existing history", summary: "Preserved verbatim." },
  ] })
  return { root, cwd, base }
}

function commit(cwd, subject, ...options) {
  git(cwd, "add", ".")
  git(cwd, "commit", "--allow-empty", "-m", subject, ...options)
  return git(cwd, "rev-parse", "HEAD")
}

function commitGenerated(cwd) {
  const files = generateRelease(cwd)
  assert.ok(files.length)
  git(cwd, "add", "--", ...files)
  git(cwd, "-c", "user.name=github-actions[bot]", "-c", "user.email=41898282+github-actions[bot]@users.noreply.github.com",
    "commit", "-m", `chore(release): publish ${read(cwd, "package.json").version}`)
}

test("catches up multiple merges in order, keeps versions aligned, and reruns without a bump", t => {
  const { cwd } = fixture(t)
  const first = commit(cwd, "feat: first change (#1)")
  git(cwd, "checkout", "-b", "feature")
  commit(cwd, "implementation detail one")
  commit(cwd, "implementation detail two")
  git(cwd, "checkout", "main")
  git(cwd, "merge", "--no-ff", "feature", "-m", "Merge pull request #2 from test/feature\n\nfeat: second change")
  const second = git(cwd, "rev-parse", "HEAD")
  commitGenerated(cwd)
  const history = read(cwd, "lib/releases.json")
  assert.equal(history.releaseCount, 2)
  assert.deepEqual(history.releases.slice(0, 2).map(r => r.commit), [second, first])
  assert.equal(history.releases[0].summary, "feat: second change (#2)")
  assert.equal(history.releases[2].summary, "Preserved verbatim.")
  assert.equal(read(cwd, "package.json").version, "0.0.16")
  const lock = read(cwd, "package-lock.json")
  assert.equal(lock.version, "0.0.16")
  assert.equal(lock.packages[""].version, "0.0.16")
  assert.equal(lock.packages.example.version, "1.2.3")
  assert.equal(read(cwd, "package.json").dependencies.example, "1.2.3")
  assert.deepEqual(generateRelease(cwd), [])
  assert.equal(git(cwd, "status", "--porcelain"), "")
  commit(cwd, "fix: third change")
  commitGenerated(cwd)
  assert.equal(read(cwd, "package.json").version, "0.0.17")
})

test("creates each ten-release review once, even when runs are coalesced", t => {
  const { cwd } = fixture(t)
  for (let n = 1; n <= 23; n++) commit(cwd, `feat: change ${n}`)
  commitGenerated(cwd)
  const firstPath = join(cwd, "docs/release-reviews/0010.md")
  const secondPath = join(cwd, "docs/release-reviews/0020.md")
  const first = readFileSync(firstPath, "utf8")
  assert.equal((first.match(/^- 0\.0\./gm) || []).length, 10)
  assert.match(first, /through 0\.0\.24/)
  assert.match(readFileSync(secondPath, "utf8"), /through 0\.0\.34/)
  assert.equal(existsSync(join(cwd, "docs/release-reviews/0030.md")), false)
  writeFileSync(firstPath, first.replace("- [ ] Review", "- [x] Review"))
  commit(cwd, "docs: release review 0010")
  commitGenerated(cwd)
  assert.match(readFileSync(firstPath, "utf8"), /\[x\] Review/)
  assert.equal(read(cwd, "lib/releases.json").releaseCount, 24)
})

test("treats commit titles as inert text and refuses a lost release cursor", t => {
  const { cwd } = fixture(t)
  commit(cwd, 'fix: `code` <script> [link](https://example.test) $(touch surprise)')
  generateRelease(cwd)
  assert.equal(existsSync(join(cwd, "surprise")), false)
  assert.match(readFileSync(join(cwd, "CHANGELOG.md"), "utf8"), /\\<script\\>/)
  const state = read(cwd, "lib/releases.json")
  state.lastProcessedCommit = "0".repeat(40)
  write(cwd, "lib/releases.json", state)
  assert.throws(() => generateRelease(cwd), /not on main's first-parent history/)
})

test("recomputes on a concurrent main push and publishes exactly once", t => {
  const { root, cwd } = fixture(t)
  commit(cwd, "feat: initial merge")
  const remote = join(root, "remote.git")
  git(root, "init", "--bare", "-b", "main", remote)
  git(cwd, "remote", "add", "origin", remote)
  git(cwd, "push", "-u", "origin", "main")
  const racer = join(root, "racer")
  git(root, "clone", remote, racer)
  git(racer, "config", "user.name", "Another workspace")
  git(racer, "config", "user.email", "racer@example.test")
  git(racer, "config", "commit.gpgsign", "false")
  // Advance main after the release job has computed its first candidate.
  const hook = join(cwd, ".git/hooks/pre-push")
  writeFileSync(hook, `#!${process.execPath}\n` +
    `const {execFileSync}=require('node:child_process'); const {unlinkSync}=require('node:fs');\n` +
    `unlinkSync(${JSON.stringify(hook)});\n` +
    `for (const args of [['commit','--allow-empty','-m','feat: racing merge'],['push','origin','main']])\n` +
    `execFileSync('git',args,{cwd:${JSON.stringify(racer)}});\n`)
  chmodSync(hook, 0o755)
  const oldActions = process.env.GITHUB_ACTIONS
  const oldRef = process.env.GITHUB_REF
  process.env.GITHUB_ACTIONS = "true"
  process.env.GITHUB_REF = "refs/heads/main"
  t.after(() => {
    if (oldActions === undefined) delete process.env.GITHUB_ACTIONS
    else process.env.GITHUB_ACTIONS = oldActions
    if (oldRef === undefined) delete process.env.GITHUB_REF
    else process.env.GITHUB_REF = oldRef
  })
  publish(cwd)
  assert.equal(read(cwd, "lib/releases.json").releaseCount, 2)
  assert.equal(read(cwd, "package.json").version, "0.0.16")
  assert.equal(git(cwd, "rev-parse", "HEAD"), git(root, "--git-dir", remote, "rev-parse", "main"))
  const published = git(cwd, "rev-parse", "HEAD")
  publish(cwd)
  assert.equal(git(cwd, "rev-parse", "HEAD"), published)
})
