import {
  BOOT_TIMEOUT_MS,
  ROOT,
  ensureEnvFile,
  readReceivedPort,
  startServer,
  stopServer,
  waitUntil,
} from './shared.mjs'

const PORT = 3400
const ASKED_HMR_PORT = 24680

function verdict(received) {
  if (received === null) return 'ERROR: no "[repro]" line within the timeout'
  if (received === ASKED_HMR_PORT) return `OK: the app received ${received}`
  return `BUG: asked ${ASKED_HMR_PORT}, the app received ${received}`
}

async function main() {
  ensureEnvFile(ROOT)
  const server = startServer({ directory: ROOT, port: PORT, askedHmrPort: ASKED_HMR_PORT })
  await waitUntil(() => readReceivedPort(server) !== null, BOOT_TIMEOUT_MS)
  const received = readReceivedPort(server)
  await stopServer(server)
  console.log(`asked VITE_HMR_PORT=${ASKED_HMR_PORT}, received=${received}`)
  console.log(verdict(received))
  return received === ASKED_HMR_PORT ? 0 : 1
}

process.exitCode = await main()
