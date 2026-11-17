import { cpSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import {
  BOOT_TIMEOUT_MS,
  ROOT,
  ensureEnvFile,
  hasPortInUseError,
  readReceivedPort,
  startServer,
  stopServer,
  waitUntil,
} from './shared.mjs'

const INSTANCES = [
  { name: 'app A', port: 3401, askedHmrPort: 24681 },
  { name: 'app B', port: 3402, askedHmrPort: 24682 },
]
const VITE_ERROR_GRACE_MS = 5_000
const EXCLUDED_ENTRIES = ['node_modules', '.git', '.adonisjs', 'build', 'tmp', 'scripts']

function copyApp(workspace, name) {
  const target = join(workspace, name.replace(' ', '_'))
  cpSync(ROOT, target, {
    recursive: true,
    filter: (source) => !EXCLUDED_ENTRIES.includes(source.slice(ROOT.length).split('/')[0]),
  })
  symlinkSync(join(ROOT, 'node_modules'), join(target, 'node_modules'))
  return target
}

function describe(server, name) {
  const received = readReceivedPort(server)
  const conflict = hasPortInUseError(server)
  console.log(
    `${name}: asked ${server.askedHmrPort}, received ${received}, "Port ... is already in use": ${conflict ? 'yes' : 'no'}`
  )
  return received !== server.askedHmrPort || conflict
}

async function main() {
  ensureEnvFile(ROOT)
  const workspace = mkdtempSync(join(tmpdir(), 'hmr-race-'))
  const servers = INSTANCES.map((instance) => {
    const directory = copyApp(workspace, instance.name)
    ensureEnvFile(directory)
    return { ...instance, server: startServer({ directory, ...instance }) }
  })
  try {
    await waitUntil(
      () => servers.every(({ server }) => readReceivedPort(server) !== null),
      BOOT_TIMEOUT_MS
    )
    await delay(VITE_ERROR_GRACE_MS)
    const failures = servers.map(({ name, server }) => describe(server, name))
    console.log('Note: the race depends on timing, run it a few times if both instances look fine.')
    console.log(
      failures.some(Boolean) ? 'BUG: conflict or overwritten port seen' : 'OK: no conflict seen'
    )
    return failures.some(Boolean) ? 1 : 0
  } finally {
    await Promise.all(servers.map(({ server }) => stopServer(server)))
    rmSync(workspace, { recursive: true, force: true })
  }
}

process.exitCode = await main()
