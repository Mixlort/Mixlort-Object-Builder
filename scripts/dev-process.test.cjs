const { EventEmitter } = require('node:events')
const { createDevProcessManager } = require('./dev-process.cjs')

function createMockProcess() {
  const processRef = new EventEmitter()
  processRef.exit = vi.fn()
  processRef.env = { TEST_ENV: '1' }
  return processRef
}

describe('dev process manager', () => {
  it('starts electron-vite in a process group and kills descendants plus the group on SIGINT', () => {
    const child = new EventEmitter()
    child.pid = 1234
    child.kill = vi.fn()
    const spawn = vi.fn(() => child)
    const kill = vi.fn()
    const listChildPids = vi.fn((pid) => {
      if (pid === 1234) return [2222]
      if (pid === 2222) return [3333]
      return []
    })
    const processRef = createMockProcess()

    const manager = createDevProcessManager({
      command: '/repo/node_modules/.bin/electron-vite',
      args: ['dev'],
      platform: 'darwin',
      processRef,
      spawn,
      kill,
      listChildPids
    })

    manager.start()
    processRef.emit('SIGINT')

    expect(spawn).toHaveBeenCalledWith('/repo/node_modules/.bin/electron-vite', ['dev'], {
      detached: true,
      env: processRef.env,
      shell: false,
      stdio: 'inherit'
    })
    expect(kill.mock.calls).toEqual([
      [3333, 'SIGTERM'],
      [2222, 'SIGTERM'],
      [-1234, 'SIGTERM']
    ])
  })

  it('exits with the child exit code when electron-vite closes', () => {
    const child = new EventEmitter()
    child.pid = 4321
    const spawn = vi.fn(() => child)
    const processRef = createMockProcess()

    const manager = createDevProcessManager({
      command: '/repo/node_modules/.bin/electron-vite',
      args: ['dev'],
      platform: 'darwin',
      processRef,
      spawn,
      kill: vi.fn()
    })

    manager.start()
    child.emit('close', 7)

    expect(processRef.exit).toHaveBeenCalledWith(7)
  })

  it('escalates to SIGKILL when the electron tree does not exit after SIGINT', () => {
    vi.useFakeTimers()

    const child = new EventEmitter()
    child.pid = 1234
    const spawn = vi.fn(() => child)
    const kill = vi.fn()
    const listChildPids = vi.fn((pid) => {
      if (pid === 1234) return [2222]
      if (pid === 2222) return [3333]
      return []
    })
    const processRef = createMockProcess()

    const manager = createDevProcessManager({
      command: '/repo/node_modules/.bin/electron-vite',
      args: ['dev'],
      platform: 'darwin',
      processRef,
      spawn,
      kill,
      listChildPids
    })

    manager.start()
    processRef.emit('SIGINT')
    vi.advanceTimersByTime(5000)

    expect(kill.mock.calls).toEqual([
      [3333, 'SIGTERM'],
      [2222, 'SIGTERM'],
      [-1234, 'SIGTERM'],
      [3333, 'SIGKILL'],
      [2222, 'SIGKILL'],
      [-1234, 'SIGKILL']
    ])
    expect(processRef.exit).toHaveBeenCalledWith(130)

    vi.useRealTimers()
  })

  it('exits the dev runner after the electron descendants disappear', () => {
    vi.useFakeTimers()

    const child = new EventEmitter()
    child.pid = 1234
    const spawn = vi.fn(() => child)
    const kill = vi.fn()
    const processRef = createMockProcess()
    let pollCount = 0
    const listChildPids = vi.fn((pid) => {
      if (pid !== 1234) return []
      pollCount += 1
      if (pollCount <= 2) return [2222]
      return []
    })

    const manager = createDevProcessManager({
      command: '/repo/node_modules/.bin/electron-vite',
      args: ['dev'],
      platform: 'darwin',
      processRef,
      spawn,
      kill,
      listChildPids
    })

    manager.start()

    vi.advanceTimersByTime(2000)
    expect(kill).not.toHaveBeenCalled()

    vi.advanceTimersByTime(2000)

    expect(kill).toHaveBeenCalledWith(-1234, 'SIGTERM')

    child.emit('close', null, 'SIGTERM')

    expect(processRef.exit).toHaveBeenCalledWith(0)

    vi.useRealTimers()
  })
})
