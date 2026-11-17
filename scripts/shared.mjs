import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

export const ROOT = new URL('..', import.meta.url).pathname
export const BOOT_TIMEOUT_MS = 60_000
const RECEIVED_PATTERN = /\[repro\] app process received VITE_HMR_PORT=(\d+)/
const PORT_IN_USE_PATTERN = /Port \d+ is already in use/
const KILL_GRACE_MS = 3_000

export function ensureEnvFile(directory) {
  const envPath = join(directory, '.env')
  if (existsSync(envPath)) return
  copyFileSync(join(ROOT, '.env.example'), envPath)
  const content = readFileSync(envPath, 'utf8')
  writeFileSync(
    envPath,
    content.replace(/^APP_KEY=.*$/m, `APP_KEY=${randomBytes(32).toString('hex')}`)
  )
}

export function startServer({ directory, port, askedHmrPort }) {
  const child = spawn('node', ['ace', 'serve', '--hmr'], {
    cwd: directory,
    detached: true,
    env: {
      ...process.env,
      PORT: String(port),
      VITE_HMR_PORT: String(askedHmrPort),
      FORCE_COLOR: '0',
    },
  })
  const server = { child, askedHmrPort, output: '' }
  const collect = (chunk) => {
    server.output += chunk.toString()
  }
  child.stdout.on('data', collect)
  child.stderr.on('data', collect)
  return server
}

export function readReceivedPort(server) {
  const match = RECEIVED_PATTERN.exec(server.output)
  return match ? Number(match[1]) : null
}

export function hasPortInUseError(server) {
  return PORT_IN_USE_PATTERN.test(server.output)
}

export async function waitUntil(condition, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (condition()) return true
    await delay(200)
  }
  return condition()
}

export async function stopServer(server) {
  const { child } = server
  if (child.exitCode !== null) return
  const exited = new Promise((resolve) => child.once('exit', resolve))
  killGroup(child.pid, 'SIGTERM')
  const timeout = delay(KILL_GRACE_MS).then(() => killGroup(child.pid, 'SIGKILL'))
  await Promise.race([exited, timeout])
}

function killGroup(pid, signal) {
  try {
    process.kill(-pid, signal)
  } catch {
    // the group is already gone
  }
}
