// @vitest-environment node

import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { writeFile, mkdir, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  readBinaryFile,
  writeBinaryFile,
  readTextFile,
  writeTextFile,
  fileExists,
  getFileInfo,
  listFiles,
  findFileInDirectory,
  watchFile,
  unwatchFile,
  unwatchAll,
  getActiveWatcherCount
} from '../file-service'
import {
  DAT_FILTER,
  SPR_FILTER,
  CLIENT_FILES_FILTER,
  OBD_FILTER,
  PNG_FILTER,
  BMP_FILTER,
  JPG_FILTER,
  GIF_FILTER,
  ALL_IMAGES_FILTER,
  IMAGE_FILTERS,
  OTB_FILTER,
  ITEMS_XML_FILTER,
  SERVER_ITEMS_FILTERS,
  OTFI_FILTER,
  ALL_FILES_FILTER
} from '../file-filters'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let testDir: string

beforeEach(async () => {
  testDir = join(tmpdir(), `ob-file-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  await mkdir(testDir, { recursive: true })
})

afterEach(async () => {
  unwatchAll()
  await rm(testDir, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// File Filters
// ---------------------------------------------------------------------------

describe('file-filters', () => {
  it('should have correct DAT filter', () => {
    expect(DAT_FILTER.name).toBe('Metadata File (*.dat)')
    expect(DAT_FILTER.extensions).toEqual(['dat'])
  })

  it('should have correct SPR filter', () => {
    expect(SPR_FILTER.name).toBe('Sprites File (*.spr)')
    expect(SPR_FILTER.extensions).toEqual(['spr'])
  })

  it('should have correct CLIENT_FILES filter', () => {
    expect(CLIENT_FILES_FILTER.extensions).toEqual(['dat', 'spr'])
  })

  it('should have correct OBD filter', () => {
    expect(OBD_FILTER.extensions).toEqual(['obd'])
  })

  it('should have all image filters', () => {
    expect(IMAGE_FILTERS).toHaveLength(5)
    expect(IMAGE_FILTERS[0]).toBe(ALL_IMAGES_FILTER)
    expect(IMAGE_FILTERS[1]).toBe(PNG_FILTER)
    expect(IMAGE_FILTERS[2]).toBe(BMP_FILTER)
    expect(IMAGE_FILTERS[3]).toBe(JPG_FILTER)
    expect(IMAGE_FILTERS[4]).toBe(GIF_FILTER)
  })

  it('should have ALL_IMAGES with all 4 formats', () => {
    expect(ALL_IMAGES_FILTER.extensions).toEqual(['png', 'bmp', 'jpg', 'gif'])
  })

  it('should have server items filters', () => {
    expect(SERVER_ITEMS_FILTERS).toHaveLength(2)
    expect(OTB_FILTER.extensions).toEqual(['otb'])
    expect(ITEMS_XML_FILTER.extensions).toEqual(['xml'])
  })

  it('should have OTFI filter', () => {
    expect(OTFI_FILTER.extensions).toEqual(['otfi'])
  })

  it('should have ALL_FILES filter', () => {
    expect(ALL_FILES_FILTER.extensions).toEqual(['*'])
  })
})

// ---------------------------------------------------------------------------
// Binary File I/O
// ---------------------------------------------------------------------------

describe('readBinaryFile / writeBinaryFile', () => {
  it('should round-trip binary data', async () => {
    const filePath = join(testDir, 'test.bin')
    const original = new Uint8Array([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd]).buffer

    await writeBinaryFile(filePath, original)
    const result = await readBinaryFile(filePath)

    expect(new Uint8Array(result)).toEqual(new Uint8Array(original))
  })

  it('should handle empty data', async () => {
    const filePath = join(testDir, 'empty.bin')
    const original = new ArrayBuffer(0)

    await writeBinaryFile(filePath, original)
    const result = await readBinaryFile(filePath)

    expect(result.byteLength).toBe(0)
  })

  it('should handle large binary data', async () => {
    const filePath = join(testDir, 'large.bin')
    const data = new Uint8Array(100_000)
    for (let i = 0; i < data.length; i++) {
      data[i] = i % 256
    }

    await writeBinaryFile(filePath, data.buffer)
    const result = await readBinaryFile(filePath)

    expect(new Uint8Array(result)).toEqual(data)
  })

  it('should create parent directories automatically', async () => {
    const filePath = join(testDir, 'nested', 'deep', 'dir', 'test.bin')
    const original = new Uint8Array([1, 2, 3]).buffer

    await writeBinaryFile(filePath, original)
    const result = await readBinaryFile(filePath)

    expect(new Uint8Array(result)).toEqual(new Uint8Array(original))
  })

  it('should throw on read of non-existent file', async () => {
    await expect(readBinaryFile(join(testDir, 'nope.bin'))).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Text File I/O
// ---------------------------------------------------------------------------

describe('readTextFile / writeTextFile', () => {
  it('should round-trip text data', async () => {
    const filePath = join(testDir, 'test.txt')
    const original = 'Hello, Object Builder!\nLine 2'

    await writeTextFile(filePath, original)
    const result = await readTextFile(filePath)

    expect(result).toBe(original)
  })

  it('should handle empty string', async () => {
    const filePath = join(testDir, 'empty.txt')

    await writeTextFile(filePath, '')
    const result = await readTextFile(filePath)

    expect(result).toBe('')
  })

  it('should support latin1 encoding', async () => {
    const filePath = join(testDir, 'latin1.txt')
    const content = '<?xml version="1.0" encoding="iso-8859-1"?>'

    await writeTextFile(filePath, content, 'latin1')
    const result = await readTextFile(filePath, 'latin1')

    expect(result).toBe(content)
  })

  it('should create parent directories automatically', async () => {
    const filePath = join(testDir, 'a', 'b', 'test.txt')

    await writeTextFile(filePath, 'nested')
    const result = await readTextFile(filePath)

    expect(result).toBe('nested')
  })
})

// ---------------------------------------------------------------------------
// fileExists
// ---------------------------------------------------------------------------

describe('fileExists', () => {
  it('should return true for existing file', async () => {
    const filePath = join(testDir, 'exists.txt')
    await writeFile(filePath, 'data')

    expect(await fileExists(filePath)).toBe(true)
  })

  it('should return false for non-existent file', async () => {
    expect(await fileExists(join(testDir, 'nope.txt'))).toBe(false)
  })

  it('should return true for existing directory', async () => {
    expect(await fileExists(testDir)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// getFileInfo
// ---------------------------------------------------------------------------

describe('getFileInfo', () => {
  it('should return info for existing file', async () => {
    const filePath = join(testDir, 'info.dat')
    await writeFile(filePath, Buffer.alloc(1024))

    const info = await getFileInfo(filePath)

    expect(info.exists).toBe(true)
    expect(info.path).toBe(filePath)
    expect(info.name).toBe('info.dat')
    expect(info.extension).toBe('.dat')
    expect(info.directory).toBe(testDir)
    expect(info.size).toBe(1024)
    expect(info.lastModified.getTime()).toBeGreaterThan(0)
  })

  it('should return info for non-existent file', async () => {
    const filePath = join(testDir, 'missing.spr')
    const info = await getFileInfo(filePath)

    expect(info.exists).toBe(false)
    expect(info.name).toBe('missing.spr')
    expect(info.extension).toBe('.spr')
    expect(info.size).toBe(0)
  })

  it('should handle file with no extension', async () => {
    const filePath = join(testDir, 'noext')
    await writeFile(filePath, 'data')

    const info = await getFileInfo(filePath)

    expect(info.name).toBe('noext')
    expect(info.extension).toBe('')
  })
})

// ---------------------------------------------------------------------------
// listFiles
// ---------------------------------------------------------------------------

describe('listFiles', () => {
  beforeEach(async () => {
    await writeFile(join(testDir, 'Tibia.dat'), '')
    await writeFile(join(testDir, 'Tibia.spr'), '')
    await writeFile(join(testDir, 'items.otb'), '')
    await writeFile(join(testDir, 'items.xml'), '')
    await writeFile(join(testDir, 'config.otfi'), '')
    await mkdir(join(testDir, 'subdir'))
  })

  it('should list all files (no filter)', async () => {
    const files = await listFiles(testDir)
    expect(files).toHaveLength(5)
  })

  it('should filter by extension', async () => {
    const datFiles = await listFiles(testDir, ['dat'])
    expect(datFiles).toHaveLength(1)
    expect(datFiles[0]).toContain('Tibia.dat')
  })

  it('should filter by multiple extensions', async () => {
    const files = await listFiles(testDir, ['dat', 'spr'])
    expect(files).toHaveLength(2)
  })

  it('should not include directories', async () => {
    const files = await listFiles(testDir)
    for (const f of files) {
      expect(f).not.toContain('subdir')
    }
  })

  it('should return sorted results', async () => {
    const files = await listFiles(testDir)
    const sorted = [...files].sort()
    expect(files).toEqual(sorted)
  })

  it('should return empty for no matches', async () => {
    const files = await listFiles(testDir, ['zip'])
    expect(files).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// findFileInDirectory
// ---------------------------------------------------------------------------

describe('findFileInDirectory', () => {
  beforeEach(async () => {
    await writeFile(join(testDir, 'Tibia.dat'), '')
    await writeFile(join(testDir, 'Tibia.spr'), '')
  })

  it('should find file with exact name', async () => {
    const result = await findFileInDirectory(testDir, 'Tibia.dat')
    expect(result).toBe(join(testDir, 'Tibia.dat'))
  })

  it('should find file case-insensitively', async () => {
    const result = await findFileInDirectory(testDir, 'tibia.dat')
    expect(result).toBe(join(testDir, 'Tibia.dat'))
  })

  it('should return null for non-existent file', async () => {
    const result = await findFileInDirectory(testDir, 'missing.dat')
    expect(result).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// File Watching
// ---------------------------------------------------------------------------

describe('watchFile / unwatchFile', () => {
  it('should start watching a file', async () => {
    const filePath = join(testDir, 'watched.dat')
    await writeFile(filePath, 'initial')

    expect(getActiveWatcherCount()).toBe(0)

    const cleanup = watchFile(filePath, () => {})
    expect(getActiveWatcherCount()).toBe(1)

    cleanup()
    expect(getActiveWatcherCount()).toBe(0)
  })

  it('should detect file changes', async () => {
    const filePath = join(testDir, 'changing.txt')
    await writeFile(filePath, 'v1')

    let changeDetected = false

    watchFile(filePath, (eventType) => {
      if (eventType === 'change') {
        changeDetected = true
      }
    })

    // Write to trigger change
    await writeFile(filePath, 'v2')

    // Wait a bit for the watcher to fire
    await new Promise((resolve) => setTimeout(resolve, 200))

    expect(changeDetected).toBe(true)
  })

  it('should replace existing watcher for same path', async () => {
    const filePath = join(testDir, 'replace.dat')
    await writeFile(filePath, 'data')

    watchFile(filePath, () => {})
    expect(getActiveWatcherCount()).toBe(1)

    watchFile(filePath, () => {})
    expect(getActiveWatcherCount()).toBe(1)
  })

  it('should unwatch specific file', async () => {
    const file1 = join(testDir, 'f1.dat')
    const file2 = join(testDir, 'f2.dat')
    await writeFile(file1, 'data')
    await writeFile(file2, 'data')

    watchFile(file1, () => {})
    watchFile(file2, () => {})
    expect(getActiveWatcherCount()).toBe(2)

    unwatchFile(file1)
    expect(getActiveWatcherCount()).toBe(1)
  })

  it('should unwatch all files', async () => {
    const file1 = join(testDir, 'a.dat')
    const file2 = join(testDir, 'b.spr')
    await writeFile(file1, '')
    await writeFile(file2, '')

    watchFile(file1, () => {})
    watchFile(file2, () => {})
    expect(getActiveWatcherCount()).toBe(2)

    unwatchAll()
    expect(getActiveWatcherCount()).toBe(0)
  })

  it('should handle unwatching non-existent path gracefully', () => {
    unwatchFile('/does/not/exist')
    expect(getActiveWatcherCount()).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Recent Directories (in-isolation test with mock storage)
// ---------------------------------------------------------------------------

describe('recent-directories (pure logic)', () => {
  // We test the serialization/deserialization logic by using the file I/O we already have

  it('should round-trip recent directories via JSON', async () => {
    const filePath = join(testDir, 'recent-directories.json')
    const data = {
      lastDirectory: '/path/to/client',
      lastMergeDirectory: '/path/to/merge',
      lastIODirectory: null,
      lastServerItemsDirectory: '/path/to/server',
      recentClientDirectories: ['/path/to/client', '/path/to/client-2']
    }

    await writeTextFile(filePath, JSON.stringify(data, null, 2))
    const content = await readTextFile(filePath)
    const parsed = JSON.parse(content)

    expect(parsed.lastDirectory).toBe('/path/to/client')
    expect(parsed.lastMergeDirectory).toBe('/path/to/merge')
    expect(parsed.lastIODirectory).toBeNull()
    expect(parsed.lastServerItemsDirectory).toBe('/path/to/server')
    expect(parsed.recentClientDirectories).toEqual(['/path/to/client', '/path/to/client-2'])
  })

  it('should handle missing keys gracefully', async () => {
    const filePath = join(testDir, 'partial.json')
    await writeTextFile(filePath, JSON.stringify({ lastDirectory: '/only/this' }))

    const content = await readTextFile(filePath)
    const parsed = JSON.parse(content)

    expect(parsed.lastDirectory).toBe('/only/this')
    expect(parsed.lastMergeDirectory).toBeUndefined()
    expect(parsed.recentClientDirectories).toBeUndefined()
  })

  it('should handle empty JSON file', async () => {
    const filePath = join(testDir, 'empty.json')
    await writeTextFile(filePath, '{}')

    const content = await readTextFile(filePath)
    const parsed = JSON.parse(content)

    expect(parsed.lastDirectory ?? null).toBeNull()
    expect(parsed.lastMergeDirectory ?? null).toBeNull()
  })

  it('should handle corrupted file gracefully', async () => {
    const filePath = join(testDir, 'corrupted.json')
    await writeTextFile(filePath, 'not valid json{{{')

    let data = {
      lastDirectory: null as string | null,
      lastMergeDirectory: null as string | null,
      lastIODirectory: null as string | null,
      lastServerItemsDirectory: null as string | null
    }

    try {
      const content = await readTextFile(filePath)
      const parsed = JSON.parse(content)
      data = {
        lastDirectory: parsed.lastDirectory ?? null,
        lastMergeDirectory: parsed.lastMergeDirectory ?? null,
        lastIODirectory: parsed.lastIODirectory ?? null,
        lastServerItemsDirectory: parsed.lastServerItemsDirectory ?? null
      }
    } catch {
      // Expected - corrupted file, use defaults
    }

    expect(data.lastDirectory).toBeNull()
    expect(data.lastMergeDirectory).toBeNull()
    expect(data.lastIODirectory).toBeNull()
    expect(data.lastServerItemsDirectory).toBeNull()
  })
})
