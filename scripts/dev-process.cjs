function getExitCodeForSignal(signal) {
  if (signal === 'SIGINT') return 130
  if (signal === 'SIGTERM') return 143
  if (signal === 'SIGHUP') return 129
  return 1
}

const FORCE_KILL_TIMEOUT_MS = 5000
const CHILD_POLL_INTERVAL_MS = 1000
const CHILD_EXIT_GRACE_MS = 1000

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
  let forceKillTimer = null
  let childPollTimer = null
  let exitCodeOverride = null
  let hasSeenDescendants = false
  let descendantsMissingSince = null

  const exit = (code) => {
    processRef.exit(typeof code === 'number' ? code : 0)
  }

  const clearForceKillTimer = () => {
    if (!forceKillTimer) return
    clearTimeout(forceKillTimer)
    forceKillTimer = null
  }

  const clearChildPollTimer = () => {
    if (!childPollTimer) return
    clearInterval(childPollTimer)
    childPollTimer = null
  }

  const shutdownForAppExit = () => {
    if (shuttingDown) return
    shuttingDown = true
    exitCodeOverride = 0
    terminateProcessTree({ child, platform, signal: 'SIGTERM', kill, spawn, listChildPids })

    forceKillTimer = setTimeout(() => {
      terminateProcessTree({ child, platform, signal: 'SIGKILL', kill, spawn, listChildPids })
      exit(0)
    }, FORCE_KILL_TIMEOUT_MS)
    if (typeof forceKillTimer.unref === 'function') {
      forceKillTimer.unref()
    }
  }

  const shutdown = (signal) => {
    if (shuttingDown) return
    shuttingDown = true
    exitCodeOverride = getExitCodeForSignal(signal)
    terminateProcessTree({ child, platform, signal: 'SIGTERM', kill, spawn, listChildPids })

    forceKillTimer = setTimeout(() => {
      terminateProcessTree({ child, platform, signal: 'SIGKILL', kill, spawn, listChildPids })
      exit(exitCodeOverride)
    }, FORCE_KILL_TIMEOUT_MS)
    if (typeof forceKillTimer.unref === 'function') {
      forceKillTimer.unref()
    }
  }

  const pollChildTree = () => {
    if (shuttingDown || !child || !child.pid || platform === 'win32') return

    const descendants = collectDescendantPids(child.pid, listChildPids || listPosixChildPids)
    if (descendants.length > 0) {
      hasSeenDescendants = true
      descendantsMissingSince = null
      return
    }

    if (!hasSeenDescendants) return

    if (descendantsMissingSince === null) {
      descendantsMissingSince = Date.now()
      return
    }

    if (Date.now() - descendantsMissingSince >= CHILD_EXIT_GRACE_MS) {
      shutdownForAppExit()
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

      if (platform !== 'win32') {
        childPollTimer = setInterval(pollChildTree, CHILD_POLL_INTERVAL_MS)
        if (typeof childPollTimer.unref === 'function') {
          childPollTimer.unref()
        }
      }

      child.on('close', (code) => {
        clearForceKillTimer()
        clearChildPollTimer()
        exit(exitCodeOverride !== null ? exitCodeOverride : code)
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
