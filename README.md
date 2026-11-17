# AdonisJS HMR port reproduction

This repository reproduces a bug in `@adonisjs/assembler` (the `VITE_HMR_PORT` value is ignored, and two apps started together race for the same HMR port). It supports an issue and a pull request in adonisjs/assembler:

- Issue: <ISSUE_URL>
- Pull request: <PR_URL>

The app is the AdonisJS v7 Hypermedia starter kit, trimmed to one route, one page and one Vite entry. A preload (`start/repro.ts`) logs the value of `VITE_HMR_PORT` the app process receives, and the page shows it too.

## Requirements and setup

- Node.js 24 or later (the kit's `engines` field).
- Ports 3400 to 3402 and 24678 to 24682 free on the machine.

```sh
npm ci
```

The scripts create `.env` from `.env.example` with a generated `APP_KEY` when it is missing.

Tested versions: `@adonisjs/assembler` 8.6.0, `@adonisjs/vite` 6.0.4, `@adonisjs/core` 7.6.0.

## Scenario 1: VITE_HMR_PORT is ignored

```sh
npm run repro:env
```

It runs `PORT=3400 VITE_HMR_PORT=24680 node ace serve --hmr`, waits for the `[repro]` line, prints the verdict, stops the server and exits 1 on the bug.

- Expected (per the [Vite guide](https://docs.adonisjs.com/guides/frontend/vite), HMR troubleshooting): setting `VITE_HMR_PORT` moves the HMR port, which is meant for running several applications at once. The app process receives 24680.
- Actual: `BUG: asked 24680, the app received 24678`.

## Scenario 2: two apps race for the same HMR port

```sh
npm run repro:race
```

It copies the app twice into a temporary directory (`node_modules` is symlinked), starts both at the same instant with `PORT` 3401/3402 and `VITE_HMR_PORT` 24681/24682, reports what each one received, then stops both and removes the copies. The race depends on timing: run it a few times if needed.

- Expected: app A receives 24681 and app B receives 24682, with no error.
- Actual: both receive 24678, and one of them logs `WebSocket server error: Port 24678 is already in use`. Both browsers' Vite clients would connect to 24678.

## Root cause

In `src/dev_server.ts`, the assembler picks the HMR port with `getRandomPort({ port: 24678 })` and passes it to the app child process as `VITE_HMR_PORT`, overwriting the value set by the user. `@adonisjs/vite` then opens its HMR websocket on `process.env.VITE_HMR_PORT`. The "is this port free" check happens in the assembler process, long before Vite opens the port in the child, so two apps started together both see 24678 as free and are both told to use it.

## Testing the fix

```sh
git clone https://github.com/Sonny93/assembler.git assembler-fix
cd assembler-fix
git checkout fix/vite-hmr-port
npm ci && npm run build
npm pack
```

Then, in this repository:

```sh
npm install --save-dev /path/to/assembler-fix/adonisjs-assembler-8.6.0.tgz
npm run repro:env
npm run repro:race
```

Both scenarios should end with `OK`. Do not commit the changed `package.json` and `package-lock.json`.

## AI disclosure

This repository was prepared with Claude Code (Claude Opus 5.5) and reviewed by the author.
