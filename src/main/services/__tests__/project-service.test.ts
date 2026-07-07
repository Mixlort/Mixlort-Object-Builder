// @vitest-environment node

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { writeFile, mkdir, rm, readFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  getProjectState,
  isProjectLoaded,
  createProject,
  loadProject,
  compileProject,
  loadMergeFiles,
  unloadProject,
  markProjectChanged,
  markProjectSaved,
  setServerItemsPath,
  updateProjectFeatures,
  discoverClientFiles,
  discoverServerItemFiles,
  resetProjectService
} from '../project-service'
import { unwatchAll } from '../file-service'
import {
  createProjectState,
  createProjectFeatures,
  applyProjectVersionDefaults
} from '../../../shared/project-state'
import type { ProjectFeatures } from '../../../shared/project-state'

vi.mock('../logger-service', () => ({
  writeLog: vi.fn(),
  writeError: vi.fn(),
  initLogger: vi.fn(),
  closeLogger: vi.fn()
}))

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let testDir: string

function makeFeatures(overrides?: Partial<ProjectFeatures>): ProjectFeatures {
  return createProjectFeatures(
    overrides?.extended ?? false,
    overrides?.transparency ?? false,
    overrides?.improvedAnimations ?? false,
    overrides?.frameGroups ?? false,
    overrides?.metadataController ?? 'default',
    overrides?.attributeServer ?? 'tfs1.4'
  )
}

function writeTestSpr(
  signature: number,
  spriteCount: number,
  sprites: Map<number, Uint8Array>,
  extended: boolean
): ArrayBuffer {
  const headerSize = extended ? 8 : 6
  const count = extended ? spriteCount : Math.min(spriteCount, 0xfffe)
  const addresses = new Uint32Array(count)
  let totalSize = headerSize + count * 4

  for (let id = 1; id <= count; id++) {
    const compressed = sprites.get(id)
    if (!compressed || compressed.length === 0) continue
    addresses[id - 1] = totalSize
    totalSize += 5 + compressed.length
  }

  const buffer = new ArrayBuffer(totalSize)
  const view = new DataView(buffer)
  let position = 0
  view.setUint32(position, signature, true)
  position += 4
  if (extended) {
    view.setUint32(position, count, true)
    position += 4
  } else {
    view.setUint16(position, count, true)
    position += 2
  }

  for (let i = 0; i < count; i++) {
    view.setUint32(position, addresses[i], true)
    position += 4
  }

  for (let id = 1; id <= count; id++) {
    const compressed = sprites.get(id)
    if (!compressed || compressed.length === 0) continue
    view.setUint8(position++, 0xff)
    view.setUint8(position++, 0x00)
    view.setUint8(position++, 0xff)
    view.setUint16(position, compressed.length, true)
    position += 2
    new Uint8Array(buffer, position, compressed.length).set(compressed)
    position += compressed.length
  }

  return buffer
}

function readTestSpr(
  buffer: ArrayBuffer,
  extended: boolean
): { spriteCount: number; sprites: Map<number, Uint8Array> } {
  const headerSize = extended ? 8 : 6
  const view = new DataView(buffer)
  const spriteCount = extended ? view.getUint32(4, true) : view.getUint16(4, true)
  const sprites = new Map<number, Uint8Array>()

  for (let id = 1; id <= spriteCount; id++) {
    const address = view.getUint32(headerSize + (id - 1) * 4, true)
    if (address === 0) continue
    const length = view.getUint16(address + 3, true)
    if (length === 0) continue
    sprites.set(id, new Uint8Array(buffer.slice(address + 5, address + 5 + length)))
  }

  return { spriteCount, sprites }
}

beforeEach(async () => {
  testDir = join(tmpdir(), `ob-project-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  await mkdir(testDir, { recursive: true })
  resetProjectService()
})

afterEach(async () => {
  resetProjectService()
  unwatchAll()
  await rm(testDir, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

describe('createProjectState', () => {
  it('should create default state', () => {
    const state = createProjectState()
    expect(state.loaded).toBe(false)
    expect(state.datFilePath).toBeNull()
    expect(state.sprFilePath).toBeNull()
    expect(state.serverItemsPath).toBeNull()
    expect(state.versionValue).toBe(0)
    expect(state.datSignature).toBe(0)
    expect(state.sprSignature).toBe(0)
    expect(state.isTemporary).toBe(false)
    expect(state.changed).toBe(false)
    expect(state.loadedFileName).toBe('')
  })
})

describe('createProjectFeatures', () => {
  it('should create default features', () => {
    const f = createProjectFeatures()
    expect(f.extended).toBe(false)
    expect(f.transparency).toBe(false)
    expect(f.improvedAnimations).toBe(false)
    expect(f.frameGroups).toBe(false)
    expect(f.metadataController).toBe('default')
    expect(f.attributeServer).toBeNull()
  })

  it('should create with custom values', () => {
    const f = createProjectFeatures(true, true, true, true, 'canary', 'tfs1.3')
    expect(f.extended).toBe(true)
    expect(f.transparency).toBe(true)
    expect(f.improvedAnimations).toBe(true)
    expect(f.frameGroups).toBe(true)
    expect(f.metadataController).toBe('canary')
    expect(f.attributeServer).toBe('tfs1.3')
  })
})

describe('applyProjectVersionDefaults', () => {
  it('should not set flags for old versions', () => {
    const f = createProjectFeatures()
    applyProjectVersionDefaults(f, 740)
    expect(f.extended).toBe(false)
    expect(f.improvedAnimations).toBe(false)
    expect(f.frameGroups).toBe(false)
  })

  it('should set extended for v960+', () => {
    const f = createProjectFeatures()
    applyProjectVersionDefaults(f, 960)
    expect(f.extended).toBe(true)
    expect(f.improvedAnimations).toBe(false)
    expect(f.frameGroups).toBe(false)
  })

  it('should set improvedAnimations for v1050+', () => {
    const f = createProjectFeatures()
    applyProjectVersionDefaults(f, 1050)
    expect(f.extended).toBe(true)
    expect(f.improvedAnimations).toBe(true)
    expect(f.frameGroups).toBe(false)
  })

  it('should set all for v1057+', () => {
    const f = createProjectFeatures()
    applyProjectVersionDefaults(f, 1057)
    expect(f.extended).toBe(true)
    expect(f.improvedAnimations).toBe(true)
    expect(f.frameGroups).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

describe('getProjectState / isProjectLoaded', () => {
  it('should start unloaded', () => {
    expect(isProjectLoaded()).toBe(false)
    const state = getProjectState()
    expect(state.loaded).toBe(false)
    expect(state.datFilePath).toBeNull()
  })

  it('should return a copy (not a reference)', () => {
    const s1 = getProjectState()
    const s2 = getProjectState()
    expect(s1).not.toBe(s2)
    expect(s1).toEqual(s2)
  })
})

// ---------------------------------------------------------------------------
// Create Project
// ---------------------------------------------------------------------------

describe('createProject', () => {
  it('should create a new temporary project', () => {
    const state = createProject({
      datSignature: 0x4e119462,
      sprSignature: 0x56c1d9fa,
      versionValue: 1056,
      features: makeFeatures()
    })

    expect(state.loaded).toBe(true)
    expect(state.isTemporary).toBe(true)
    expect(state.changed).toBe(false)
    expect(state.datFilePath).toBeNull()
    expect(state.sprFilePath).toBeNull()
    expect(state.versionValue).toBe(1056)
    expect(state.datSignature).toBe(0x4e119462)
    expect(state.sprSignature).toBe(0x56c1d9fa)
    expect(isProjectLoaded()).toBe(true)
  })

  it('should apply version defaults to features', () => {
    const state = createProject({
      datSignature: 0x4e119462,
      sprSignature: 0x56c1d9fa,
      versionValue: 1056,
      features: makeFeatures()
    })

    // v1056 >= 960 => extended, >= 1050 => improvedAnimations, < 1057 => no frameGroups
    expect(state.features.extended).toBe(true)
    expect(state.features.improvedAnimations).toBe(true)
    expect(state.features.frameGroups).toBe(false)
  })

  it('should unload existing project before creating', () => {
    createProject({
      datSignature: 1,
      sprSignature: 2,
      versionValue: 740,
      features: makeFeatures()
    })

    const state = createProject({
      datSignature: 3,
      sprSignature: 4,
      versionValue: 860,
      features: makeFeatures()
    })

    expect(state.datSignature).toBe(3)
    expect(state.versionValue).toBe(860)
  })
})

// ---------------------------------------------------------------------------
// Load Project
// ---------------------------------------------------------------------------

describe('loadProject', () => {
  let datPath: string
  let sprPath: string

  beforeEach(async () => {
    datPath = join(testDir, 'Tibia.dat')
    sprPath = join(testDir, 'Tibia.spr')
    // Create minimal binary files
    await writeFile(datPath, Buffer.from([0x62, 0x94, 0x11, 0x4e, 0x00, 0x00, 0x00, 0x00]))
    await writeFile(sprPath, Buffer.from([0xfa, 0xd9, 0xc1, 0x56, 0x00, 0x00]))
  })

  it('should load DAT and SPR files', async () => {
    const result = await loadProject({
      datFilePath: datPath,
      sprFilePath: sprPath,
      versionValue: 1056,
      datSignature: 0x4e119462,
      sprSignature: 0x56c1d9fa,
      features: makeFeatures()
    })

    expect(result.datBuffer.byteLength).toBe(8)
    expect(result.sprBuffer?.byteLength).toBe(6)
    expect(result.otbBuffer).toBeNull()
    expect(result.xmlContent).toBeNull()
    expect(result.otfiContent).toBeNull()

    expect(isProjectLoaded()).toBe(true)
    const state = getProjectState()
    expect(state.datFilePath).toBe(datPath)
    expect(state.sprFilePath).toBe(sprPath)
    expect(state.isTemporary).toBe(false)
    expect(state.loadedFileName).toBe('Tibia.dat')
  })

  it('should load OTFI file if present alongside DAT', async () => {
    const otfiPath = join(testDir, 'Tibia.otfi')
    await writeFile(otfiPath, 'DatSpr\n  extended: true')

    const result = await loadProject({
      datFilePath: datPath,
      sprFilePath: sprPath,
      versionValue: 1056,
      datSignature: 0x4e119462,
      sprSignature: 0x56c1d9fa,
      features: makeFeatures()
    })

    expect(result.otfiContent).toBe('DatSpr\n  extended: true')
  })

  it('should load server items if path provided', async () => {
    const serverDir = join(testDir, 'server')
    await mkdir(serverDir)
    await writeFile(join(serverDir, 'items.otb'), Buffer.from([0x00, 0x00, 0x00, 0x00]))
    await writeFile(join(serverDir, 'items.xml'), '<?xml version="1.0"?><items/>')

    const result = await loadProject({
      datFilePath: datPath,
      sprFilePath: sprPath,
      versionValue: 1056,
      datSignature: 0x4e119462,
      sprSignature: 0x56c1d9fa,
      features: makeFeatures(),
      serverItemsPath: serverDir
    })

    expect(result.otbBuffer).not.toBeNull()
    expect(result.otbBuffer!.byteLength).toBe(4)
    expect(result.xmlContent).toBe('<?xml version="1.0"?><items/>')

    expect(getProjectState().serverItemsPath).toBe(serverDir)
  })

  it('should throw if DAT file does not exist', async () => {
    await expect(
      loadProject({
        datFilePath: join(testDir, 'missing.dat'),
        sprFilePath: sprPath,
        versionValue: 1056,
        datSignature: 0,
        sprSignature: 0,
        features: makeFeatures()
      })
    ).rejects.toThrow('DAT file not found')
  })

  it('should throw if SPR file does not exist', async () => {
    await expect(
      loadProject({
        datFilePath: datPath,
        sprFilePath: join(testDir, 'missing.spr'),
        versionValue: 1056,
        datSignature: 0,
        sprSignature: 0,
        features: makeFeatures()
      })
    ).rejects.toThrow('SPR file not found')
  })

  it('should apply version defaults to features', async () => {
    await loadProject({
      datFilePath: datPath,
      sprFilePath: sprPath,
      versionValue: 1057,
      datSignature: 0,
      sprSignature: 0,
      features: makeFeatures()
    })

    const state = getProjectState()
    expect(state.features.extended).toBe(true)
    expect(state.features.improvedAnimations).toBe(true)
    expect(state.features.frameGroups).toBe(true)
  })

  it('should unload previous project before loading', async () => {
    createProject({
      datSignature: 1,
      sprSignature: 2,
      versionValue: 740,
      features: makeFeatures()
    })

    await loadProject({
      datFilePath: datPath,
      sprFilePath: sprPath,
      versionValue: 1056,
      datSignature: 0x4e119462,
      sprSignature: 0x56c1d9fa,
      features: makeFeatures()
    })

    expect(getProjectState().versionValue).toBe(1056)
    expect(getProjectState().isTemporary).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Compile Project
// ---------------------------------------------------------------------------

describe('compileProject', () => {
  let datPath: string
  let sprPath: string

  beforeEach(async () => {
    datPath = join(testDir, 'output', 'Tibia.dat')
    sprPath = join(testDir, 'output', 'Tibia.spr')

    // Create a loaded project first
    createProject({
      datSignature: 0x4e119462,
      sprSignature: 0x56c1d9fa,
      versionValue: 1056,
      features: makeFeatures()
    })
  })

  it('should write DAT and SPR files', async () => {
    const datBuffer = new Uint8Array([1, 2, 3, 4]).buffer
    const sprBuffer = new Uint8Array([5, 6, 7, 8]).buffer

    await compileProject({
      datFilePath: datPath,
      sprFilePath: sprPath,
      datBuffer,
      sprBuffer,
      versionValue: 1056,
      datSignature: 0x4e119462,
      sprSignature: 0x56c1d9fa,
      features: makeFeatures()
    })

    const datResult = await readFile(datPath)
    expect(Array.from(datResult)).toEqual([1, 2, 3, 4])

    const sprResult = await readFile(sprPath)
    expect(Array.from(sprResult)).toEqual([5, 6, 7, 8])
  })

  it('syncs project state version/features with the compiled output', async () => {
    // Loaded as v1056; compile to v860 (non-extended). State must follow so a
    // later in-place save parses the source SPR with the correct header width.
    await compileProject({
      datFilePath: datPath,
      sprFilePath: sprPath,
      datBuffer: new Uint8Array([1, 2, 3, 4]).buffer,
      sprBuffer: new Uint8Array([5, 6, 7, 8]).buffer,
      versionValue: 860,
      datSignature: 0x4e119462,
      sprSignature: 0x56c1d9fa,
      features: makeFeatures({ extended: false })
    })

    const state = getProjectState()
    expect(state.versionValue).toBe(860)
    expect(state.features.extended).toBe(false)
  })

  it('should compile SPR from a streaming write plan', async () => {
    const originalSprites = new Map<number, Uint8Array>([
      [1, new Uint8Array([1, 1, 1])],
      [2, new Uint8Array([2, 2, 2])]
    ])
    const originalSpr = writeTestSpr(0x56c1d9fa, 2, originalSprites, true)
    await mkdir(join(testDir, 'output'), { recursive: true })
    await writeFile(sprPath, Buffer.from(originalSpr))

    const override = new Uint8Array([9, 9, 9])
    const added = new Uint8Array([3, 3, 3])

    await compileProject({
      datFilePath: datPath,
      sprFilePath: sprPath,
      datBuffer: new Uint8Array([1, 2, 3, 4]).buffer,
      versionValue: 1056,
      datSignature: 0x4e119462,
      sprSignature: 0x56c1d9fa,
      features: makeFeatures(),
      sprWritePlan: {
        sourceFilePath: sprPath,
        signature: 0x56c1d9fa,
        spriteCount: 3,
        extended: true,
        overrides: [
          [1, override],
          [3, added]
        ],
        deletedIds: [2]
      }
    })

    const written = await readFile(sprPath)
    const result = readTestSpr(
      written.buffer.slice(written.byteOffset, written.byteOffset + written.byteLength),
      true
    )

    expect(result.sprites.get(1)).toEqual(override)
    expect(result.sprites.has(2)).toBe(false)
    expect(result.sprites.get(3)).toEqual(added)
    expect(result.spriteCount).toBe(3)
  })

  it('fast-path copies the source SPR verbatim when nothing changed', async () => {
    const originalSprites = new Map<number, Uint8Array>([
      [1, new Uint8Array([1, 1, 1])],
      [2, new Uint8Array([2, 2, 2])]
    ])
    const originalSpr = writeTestSpr(0x56c1d9fa, 2, originalSprites, true)
    await mkdir(join(testDir, 'output'), { recursive: true })
    await writeFile(sprPath, Buffer.from(originalSpr))
    const targetPath = join(testDir, 'output', 'Tibia2.spr')

    await compileProject({
      datFilePath: datPath,
      sprFilePath: targetPath,
      datBuffer: new Uint8Array([1, 2, 3, 4]).buffer,
      versionValue: 1056,
      datSignature: 0x4e119462,
      sprSignature: 0x56c1d9fa,
      features: makeFeatures(),
      sprWritePlan: {
        sourceFilePath: sprPath,
        signature: 0x56c1d9fa,
        spriteCount: 2,
        extended: true,
        overrides: [],
        deletedIds: []
      }
    })

    const written = await readFile(targetPath)
    expect(Array.from(written)).toEqual(Array.from(new Uint8Array(originalSpr)))
  })

  it('should compile SPR from a packed streaming write plan', async () => {
    const originalSprites = new Map<number, Uint8Array>([
      [1, new Uint8Array([1, 1, 1])],
      [2, new Uint8Array([2, 2, 2])]
    ])
    const originalSpr = writeTestSpr(0x56c1d9fa, 2, originalSprites, true)
    await mkdir(join(testDir, 'output'), { recursive: true })
    await writeFile(sprPath, Buffer.from(originalSpr))

    const override = new Uint8Array([9, 9, 9])
    const added = new Uint8Array([3, 3, 3, 3])
    const overrideData = new Uint8Array(override.length + added.length)
    overrideData.set(override, 0)
    overrideData.set(added, override.length)

    await compileProject({
      datFilePath: datPath,
      sprFilePath: sprPath,
      datBuffer: new Uint8Array([1, 2, 3, 4]).buffer,
      versionValue: 1056,
      datSignature: 0x4e119462,
      sprSignature: 0x56c1d9fa,
      features: makeFeatures(),
      sprWritePlan: {
        sourceFilePath: sprPath,
        signature: 0x56c1d9fa,
        spriteCount: 3,
        extended: true,
        overrides: [],
        overrideIndex: [
          [1, 0, override.length],
          [3, override.length, added.length]
        ],
        overrideData: overrideData.buffer,
        deletedIds: [2]
      }
    })

    const written = await readFile(sprPath)
    const result = readTestSpr(
      written.buffer.slice(written.byteOffset, written.byteOffset + written.byteLength),
      true
    )

    expect(result.sprites.get(1)).toEqual(override)
    expect(result.sprites.has(2)).toBe(false)
    expect(result.sprites.get(3)).toEqual(added)
    expect(result.spriteCount).toBe(3)
  })

  it('should reject non-extended streaming SPR plans above 0xFFFE sprites', async () => {
    await expect(
      compileProject({
        datFilePath: datPath,
        sprFilePath: sprPath,
        datBuffer: new Uint8Array([1, 2, 3, 4]).buffer,
        versionValue: 860,
        datSignature: 0x4e119462,
        sprSignature: 0x56c1d9fa,
        features: makeFeatures({ extended: false }),
        sprWritePlan: {
          sourceFilePath: sprPath,
          signature: 0x56c1d9fa,
          spriteCount: 0xffff,
          extended: false,
          overrides: [],
          deletedIds: []
        }
      })
    ).rejects.toThrow(/extended/i)
  })

  it('should write OTFI file alongside DAT', async () => {
    await compileProject({
      datFilePath: datPath,
      sprFilePath: sprPath,
      datBuffer: new ArrayBuffer(4),
      sprBuffer: new ArrayBuffer(4),
      versionValue: 1056,
      datSignature: 0x4e119462,
      sprSignature: 0x56c1d9fa,
      features: makeFeatures(),
      otfiContent: 'DatSpr\n  extended: true'
    })

    const otfiPath = join(testDir, 'output', 'Tibia.otfi')
    const content = await readFile(otfiPath, 'utf-8')
    expect(content).toBe('DatSpr\n  extended: true')
  })

  it('should write server items if provided', async () => {
    const serverDir = join(testDir, 'server-out')
    await mkdir(serverDir)

    await compileProject({
      datFilePath: datPath,
      sprFilePath: sprPath,
      datBuffer: new ArrayBuffer(4),
      sprBuffer: new ArrayBuffer(4),
      versionValue: 1056,
      datSignature: 0x4e119462,
      sprSignature: 0x56c1d9fa,
      features: makeFeatures(),
      serverItemsPath: serverDir,
      otbBuffer: new Uint8Array([0xfe, 0x00]).buffer,
      xmlContent: '<items/>'
    })

    const otbResult = await readFile(join(serverDir, 'items.otb'))
    expect(Array.from(otbResult)).toEqual([0xfe, 0x00])

    const xmlResult = await readFile(join(serverDir, 'items.xml'), 'latin1')
    expect(xmlResult).toBe('<items/>')
  })

  it('should restore DAT and SPR from backups if compile fails mid-write', async () => {
    await mkdir(join(testDir, 'output'), { recursive: true })
    await writeFile(datPath, Buffer.from([0xaa, 0xbb, 0xcc]))
    await writeFile(sprPath, Buffer.from([0xdd, 0xee, 0xff]))

    const blockedServerItemsPath = join(testDir, 'blocked-server-items')
    await writeFile(blockedServerItemsPath, 'not-a-directory')

    await expect(
      compileProject({
        datFilePath: datPath,
        sprFilePath: sprPath,
        datBuffer: new Uint8Array([1, 2, 3, 4]).buffer,
        sprBuffer: new Uint8Array([5, 6, 7, 8]).buffer,
        versionValue: 1056,
        datSignature: 0x4e119462,
        sprSignature: 0x56c1d9fa,
        features: makeFeatures(),
        serverItemsPath: blockedServerItemsPath,
        otbBuffer: new Uint8Array([0xfe]).buffer
      })
    ).rejects.toThrow()

    expect(Array.from(await readFile(datPath))).toEqual([0xaa, 0xbb, 0xcc])
    expect(Array.from(await readFile(sprPath))).toEqual([0xdd, 0xee, 0xff])
  })

  it('should update state after compile', async () => {
    markProjectChanged()
    expect(getProjectState().changed).toBe(true)

    await compileProject({
      datFilePath: datPath,
      sprFilePath: sprPath,
      datBuffer: new ArrayBuffer(4),
      sprBuffer: new ArrayBuffer(4),
      versionValue: 1056,
      datSignature: 0x4e119462,
      sprSignature: 0x56c1d9fa,
      features: makeFeatures()
    })

    const state = getProjectState()
    expect(state.changed).toBe(false)
    expect(state.isTemporary).toBe(false)
    expect(state.datFilePath).toBe(datPath)
    expect(state.sprFilePath).toBe(sprPath)
    expect(state.loadedFileName).toBe('Tibia.dat')
  })

  it('should throw if no project is loaded', async () => {
    unloadProject()

    await expect(
      compileProject({
        datFilePath: datPath,
        sprFilePath: sprPath,
        datBuffer: new ArrayBuffer(4),
        sprBuffer: new ArrayBuffer(4),
        versionValue: 1056,
        datSignature: 0x4e119462,
        sprSignature: 0x56c1d9fa,
        features: makeFeatures()
      })
    ).rejects.toThrow('No project loaded')
  })
})

// ---------------------------------------------------------------------------
// Load Merge Files
// ---------------------------------------------------------------------------

describe('loadMergeFiles', () => {
  let mergeDat: string
  let mergeSpr: string

  beforeEach(async () => {
    mergeDat = join(testDir, 'merge', 'Tibia.dat')
    mergeSpr = join(testDir, 'merge', 'Tibia.spr')
    await mkdir(join(testDir, 'merge'))
    await writeFile(mergeDat, Buffer.from([0xaa, 0xbb, 0xcc]))
    await writeFile(mergeSpr, Buffer.from([0xdd, 0xee, 0xff]))

    createProject({
      datSignature: 1,
      sprSignature: 2,
      versionValue: 1056,
      features: makeFeatures()
    })
  })

  it('should read merge files', async () => {
    const result = await loadMergeFiles({
      datFilePath: mergeDat,
      sprFilePath: mergeSpr,
      versionValue: 860,
      datSignature: 3,
      sprSignature: 4,
      features: makeFeatures()
    })

    expect(new Uint8Array(result.datBuffer)).toEqual(new Uint8Array([0xaa, 0xbb, 0xcc]))
    expect(new Uint8Array(result.sprBuffer)).toEqual(new Uint8Array([0xdd, 0xee, 0xff]))
  })

  it('should throw if no project loaded', async () => {
    unloadProject()

    await expect(
      loadMergeFiles({
        datFilePath: mergeDat,
        sprFilePath: mergeSpr,
        versionValue: 860,
        datSignature: 3,
        sprSignature: 4,
        features: makeFeatures()
      })
    ).rejects.toThrow('No project loaded')
  })

  it('should throw if merge DAT not found', async () => {
    await expect(
      loadMergeFiles({
        datFilePath: join(testDir, 'missing.dat'),
        sprFilePath: mergeSpr,
        versionValue: 860,
        datSignature: 3,
        sprSignature: 4,
        features: makeFeatures()
      })
    ).rejects.toThrow('Merge DAT file not found')
  })

  it('should throw if merge SPR not found', async () => {
    await expect(
      loadMergeFiles({
        datFilePath: mergeDat,
        sprFilePath: join(testDir, 'missing.spr'),
        versionValue: 860,
        datSignature: 3,
        sprSignature: 4,
        features: makeFeatures()
      })
    ).rejects.toThrow('Merge SPR file not found')
  })
})

// ---------------------------------------------------------------------------
// Unload Project
// ---------------------------------------------------------------------------

describe('unloadProject', () => {
  it('should reset state to defaults', () => {
    createProject({
      datSignature: 1,
      sprSignature: 2,
      versionValue: 1056,
      features: makeFeatures()
    })

    expect(isProjectLoaded()).toBe(true)

    unloadProject()

    expect(isProjectLoaded()).toBe(false)
    const state = getProjectState()
    expect(state.datFilePath).toBeNull()
    expect(state.sprFilePath).toBeNull()
    expect(state.versionValue).toBe(0)
    expect(state.isTemporary).toBe(false)
  })

  it('should be idempotent (safe to call when not loaded)', () => {
    unloadProject()
    unloadProject()
    expect(isProjectLoaded()).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// State mutations
// ---------------------------------------------------------------------------

describe('markProjectChanged / markProjectSaved', () => {
  beforeEach(() => {
    createProject({
      datSignature: 1,
      sprSignature: 2,
      versionValue: 1056,
      features: makeFeatures()
    })
  })

  it('should mark project as changed', () => {
    expect(getProjectState().changed).toBe(false)
    markProjectChanged()
    expect(getProjectState().changed).toBe(true)
  })

  it('should mark project as saved', () => {
    markProjectChanged()
    markProjectSaved()
    expect(getProjectState().changed).toBe(false)
  })

  it('should not change state when no project loaded', () => {
    unloadProject()
    markProjectChanged()
    expect(getProjectState().changed).toBe(false)
  })
})

describe('setServerItemsPath', () => {
  it('should update server items path', () => {
    createProject({
      datSignature: 1,
      sprSignature: 2,
      versionValue: 1056,
      features: makeFeatures()
    })

    setServerItemsPath('/path/to/server')
    expect(getProjectState().serverItemsPath).toBe('/path/to/server')
  })

  it('should not change when no project loaded', () => {
    setServerItemsPath('/path')
    expect(getProjectState().serverItemsPath).toBeNull()
  })
})

describe('updateProjectFeatures', () => {
  it('should update specific features', () => {
    createProject({
      datSignature: 1,
      sprSignature: 2,
      versionValue: 740,
      features: makeFeatures()
    })

    updateProjectFeatures({ transparency: true, attributeServer: 'tfs1.3' })

    const state = getProjectState()
    expect(state.features.transparency).toBe(true)
    expect(state.features.attributeServer).toBe('tfs1.3')
    // Others unchanged
    expect(state.features.metadataController).toBe('default')
  })

  it('should not change when no project loaded', () => {
    updateProjectFeatures({ transparency: true })
    expect(getProjectState().features.transparency).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

describe('discoverClientFiles', () => {
  it('should find client files in a directory', async () => {
    await writeFile(join(testDir, 'Tibia.dat'), '')
    await writeFile(join(testDir, 'Tibia.spr'), '')
    await writeFile(join(testDir, 'Tibia.otfi'), '')

    const result = await discoverClientFiles(testDir)
    expect(result.datFile).toContain('Tibia.dat')
    expect(result.sprFile).toContain('Tibia.spr')
    expect(result.otfiFile).toContain('Tibia.otfi')
  })

  it('should return null for missing files', async () => {
    const result = await discoverClientFiles(testDir)
    expect(result.datFile).toBeNull()
    expect(result.sprFile).toBeNull()
    expect(result.otfiFile).toBeNull()
  })
})

describe('discoverServerItemFiles', () => {
  it('should find server item files', async () => {
    await writeFile(join(testDir, 'items.otb'), '')
    await writeFile(join(testDir, 'items.xml'), '')

    const result = await discoverServerItemFiles(testDir)
    expect(result.otbFile).toContain('items.otb')
    expect(result.xmlFile).toContain('items.xml')
  })

  it('should return null for missing files', async () => {
    const result = await discoverServerItemFiles(testDir)
    expect(result.otbFile).toBeNull()
    expect(result.xmlFile).toBeNull()
  })
})
