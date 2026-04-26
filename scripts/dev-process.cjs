function getExitCodeForSignal(signal) {
  if (signal === 'SIGINT') return 130
  if (signal === 'SIGTERM') return 143
  if (signal === 'SIGHUP') return 129
  return 1
}

function listPosixChildPids(pid) {
  try {
    const { execFileSync } = require('node:child_process')
    return execFileSync('pgrep', ['-P', String(pid)], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    })
      .split(/\s+/)
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0)
  } catch {
    return []
  }
}

function collectDescendantPids(pid, listChildPids) {
  const descendants = []
  const children = listChildPids(pid)
  for (const childPid of children) {
    descendants.push(...collectDescendantPids(childPid, listChildPids))
    descendants.push(childPid)
  }
  return descendants
}

function terminateProcessTree({ child, platform, signal, kill, spawn, listChildPids }) {
  if (!child || !child.pid) return

  if (platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
      detached: false,
      shell: false,
      stdio: 'ignore'
    })
    return
  }

  for (const pid of collectDescendantPids(child.pid, listChildPids || listPosixChildPids)) {
    try {
      kill(pid, signal)
    } catch {
      // The process may already be gone.
    }
  }

  try {
    kill(-child.pid, signal)
  } catch (error) {
    if (!error || error.code !== 'ESRCH') {
      try {
        kill(child.pid, signal)
      } catch {
        // The process may already be gone.
      }
    }
  }
}

function createDevProcessManager({
  command,
  args,
  platform = process.platform,
  processRef = process,
  spawn = require('node:child_process').spawn,
  kill = process.kill,
  listChildPids = listPosixChildPids
}) {
  let child = null
  let shuttingDown = false

  const exit = (code) => {
    processRef.exit(typeof code === 'number' ? code : 0)
  }

  const shutdown = (signal) => {
    if (shuttingDown) return
    shuttingDown = true
    terminateProcessTree({ child, platform, signal: 'SIGTERM', kill, spawn, listChildPids })

    const fallback = setTimeout(() => {
      exit(getExitCodeForSignal(signal))
    }, 5000)
    if (typeof fallback.unref === 'function') {
      fallback.unref()
    }
  }

  return {
    start() {
      child = spawn(command, args, {
        detached: platform !== 'win32',
        env: processRef.env,
        shell: platform === 'win32',
        stdio: 'inherit'
      })

      child.on('close', (code) => {
        exit(code)
      })

      processRef.once('SIGINT', () => shutdown('SIGINT'))
      processRef.once('SIGTERM', () => shutdown('SIGTERM'))
      if (platform !== 'win32') {
        processRef.once('SIGHUP', () => shutdown('SIGHUP'))
      }

      return child
    },
    shutdown
  }
}

module.exports = {
  createDevProcessManager,
  terminateProcessTree
}
