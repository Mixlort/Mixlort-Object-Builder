import { describe, it, expect, beforeEach } from 'vitest'
import {
  type ThingType,
  type ServerItem,
  createThingType,
  createServerItem,
  FrameGroupType,
  ServerItemType,
  TileStackOrder,
  createFrameGroup
} from '../../../types'
import { md5 } from '../md5'
import { computeSpriteHash } from '../sprite-hash'
import { syncFromThingType, createFromThingType, flagsMatch } from '../otb-sync'
import {
  loadServerItems,
  saveServerItems,
  syncItem,
  syncAllItems,
  createMissingItems,
  findOutOfSyncItems,
  getServerItemList,
  isLoaded,
  getItemByServerId,
  getItemsByClientId,
  getFirstItemByClientId,
  getEditableXmlAttributes,
  setEditableXmlAttributes,
  applyServerItemNames,
  setAttributeServer,
  getAttributeServerName,
  unloadServerItems,
  resetServerItemsService
} from '../server-items-service'
import { writeOtb, ServerItemList } from '../../otb'
import { compressPixels } from '../../spr'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeThingType(overrides: Partial<ThingType> = {}): ThingType {
  const thing = createThingType()
  Object.assign(thing, overrides)
  return thing
}

function makeGroundThing(): ThingType {
  const thing = makeThingType({ isGround: true, groundSpeed: 100 })
  const fg = createFrameGroup()
  fg.spriteIndex = [1]
  thing.frameGroups[FrameGroupType.DEFAULT] = fg
  return thing
}

function makeAnimatedThing(): ThingType {
  const thing = makeThingType()
  const fg = createFrameGroup()
  fg.frames = 3
  fg.spriteIndex = [1, 2, 3]
  thing.frameGroups[FrameGroupType.DEFAULT] = fg
  return thing
}

function makeOtbBuffer(items: ServerItem[] = []): ArrayBuffer {
  const list = new ServerItemList()
  list.majorVersion = 3
  list.minorVersion = 58
  list.buildNumber = 0
  list.clientVersion = 1056
  for (const item of items) {
    list.add(item)
  }
  return writeOtb(list)
}

function makeSolidPixels(): Uint8Array {
  // Create a simple 32x32 solid red sprite (ARGB)
  const pixels = new Uint8Array(32 * 32 * 4)
  for (let i = 0; i < 32 * 32; i++) {
    pixels[i * 4] = 0xff // A
    pixels[i * 4 + 1] = 0xff // R
    pixels[i * 4 + 2] = 0x00 // G
    pixels[i * 4 + 3] = 0x00 // B
  }
  return compressPixels(pixels, false)
}

// =========================================================================
// MD5
// =========================================================================

describe('md5', () => {
  it('should hash empty input', () => {
    const result = md5(new Uint8Array(0))
    expect(result).toHaveLength(16)
    // MD5("") = d41d8cd98f00b204e9800998ecf8427e
    const hex = Array.from(result)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
    expect(hex).toBe('d41d8cd98f00b204e9800998ecf8427e')
  })

  it('should hash "abc"', () => {
    const input = new TextEncoder().encode('abc')
    const result = md5(input)
    const hex = Array.from(result)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
    // MD5("abc") = 900150983cd24fb0d6963f7d28e17f72
    expect(hex).toBe('900150983cd24fb0d6963f7d28e17f72')
  })

  it('should hash longer input', () => {
    const input = new TextEncoder().encode('The quick brown fox jumps over the lazy dog')
    const result = md5(input)
    const hex = Array.from(result)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
    // MD5("The quick brown fox jumps over the lazy dog") = 9e107d9d372bb6826bd81d3542a419d6
    expect(hex).toBe('9e107d9d372bb6826bd81d3542a419d6')
  })

  it('should return 16 bytes', () => {
    const result = md5(new Uint8Array(1000))
    expect(result).toBeInstanceOf(Uint8Array)
    expect(result).toHaveLength(16)
  })

  it('should produce different hashes for different inputs', () => {
    const h1 = md5(new Uint8Array([1, 2, 3]))
    const h2 = md5(new Uint8Array([4, 5, 6]))
    expect(h1).not.toEqual(h2)
  })
})

// =========================================================================
// Sprite Hash
// =========================================================================

describe('computeSpriteHash', () => {
  it('should return empty hash for thing without frame group', () => {
    const thing = makeThingType()
    thing.frameGroups = []
    const result = computeSpriteHash(thing, () => null, false)
    expect(result).toHaveLength(16)
    expect(result.every((b) => b === 0)).toBe(true)
  })

  it('should return empty hash for frame group with insufficient sprites', () => {
    const thing = makeThingType()
    const fg = createFrameGroup()
    fg.width = 2
    fg.height = 2
    fg.spriteIndex = [1] // Needs 4, only has 1
    thing.frameGroups[FrameGroupType.DEFAULT] = fg
    const result = computeSpriteHash(thing, () => null, false)
    expect(result.every((b) => b === 0)).toBe(true)
  })

  it('should compute hash for a simple 1x1 sprite', () => {
    const thing = makeThingType()
    const fg = createFrameGroup()
    fg.spriteIndex = [1]
    thing.frameGroups[FrameGroupType.DEFAULT] = fg

    const solidPixels = makeSolidPixels()
    const result = computeSpriteHash(thing, (id) => (id === 1 ? solidPixels : null), false)

    expect(result).toHaveLength(16)
    // Should not be empty hash since we have pixel data
    expect(result.some((b) => b !== 0)).toBe(true)
  })

  it('should produce transparent hash for empty sprites', () => {
    const thing = makeThingType()
    const fg = createFrameGroup()
    fg.spriteIndex = [0] // sprite ID 0 = empty
    thing.frameGroups[FrameGroupType.DEFAULT] = fg

    const result = computeSpriteHash(thing, () => null, false)
    expect(result).toHaveLength(16)
    // Should produce a valid (non-zero) hash of the transparent data
    expect(result.some((b) => b !== 0)).toBe(true)
  })

  it('should produce same hash for same sprites', () => {
    const thing = makeThingType()
    const fg = createFrameGroup()
    fg.spriteIndex = [1]
    thing.frameGroups[FrameGroupType.DEFAULT] = fg

    const solidPixels = makeSolidPixels()
    const provider = (id: number) => (id === 1 ? solidPixels : null)

    const h1 = computeSpriteHash(thing, provider, false)
    const h2 = computeSpriteHash(thing, provider, false)
    expect(h1).toEqual(h2)
  })

  it('should hash multiple sprites (width * height * layers)', () => {
    const thing = makeThingType()
    const fg = createFrameGroup()
    fg.width = 2
    fg.height = 1
    fg.layers = 1
    fg.spriteIndex = [1, 2, 3, 4] // 2*1*1 = 2 sprites to hash, rest ignored
    thing.frameGroups[FrameGroupType.DEFAULT] = fg

    const solid = makeSolidPixels()
    const result = computeSpriteHash(thing, (id) => (id <= 2 ? solid : null), false)
    expect(result).toHaveLength(16)
    expect(result.some((b) => b !== 0)).toBe(true)
  })
})

// =========================================================================
// Editable XML Attributes
// =========================================================================

describe('editable XML attributes', () => {
  beforeEach(() => {
    resetServerItemsService()
  })

  it('should expose only string XML attributes for editor usage', () => {
    const item = createServerItem()
    item.id = 1000
    item.clientId = 100

    loadServerItems({ otbBuffer: makeOtbBuffer([item]) })

    const loaded = getFirstItemByClientId(100)
    expect(loaded).toBeDefined()

    loaded!.xmlAttributes = {
      name: 'Sword',
      article: 'a',
      attribute: {
        key: 'attack',
        value: '35'
      }
    }

    expect(getEditableXmlAttributes(100)).toEqual({
      name: 'Sword',
      article: 'a'
    })
  })

  it('should update flat XML attributes while preserving nested ones', () => {
    const first = createServerItem()
    first.id = 1000
    first.clientId = 100

    const second = createServerItem()
    second.id = 1001
    second.clientId = 100

    loadServerItems({ otbBuffer: makeOtbBuffer([first, second]) })

    for (const item of getItemsByClientId(100)) {
      item.xmlAttributes = {
        name: 'Sword',
        article: 'a',
        attribute: {
          key: 'attack',
          value: '35'
        }
      }
    }

    expect(setEditableXmlAttributes(100, { name: 'Golden Sword', plural: 'golden swords' })).toBe(2)

    for (const item of getItemsByClientId(100)) {
      expect(item.xmlAttributes).toEqual({
        attribute: {
          key: 'attack',
          value: '35'
        },
        name: 'Golden Sword',
        plural: 'golden swords'
      })
    }
  })
})

// =========================================================================
// OtbSync - syncFromThingType
// =========================================================================

describe('syncFromThingType', () => {
  let item: ServerItem
  let thing: ThingType

  beforeEach(() => {
    item = createServerItem()
    thing = createThingType()
  })

  describe('type mapping', () => {
    it('should NOT sync type by default', () => {
      thing.isGround = true
      syncFromThingType(item, thing)
      expect(item.type).toBe(ServerItemType.NONE) // Not synced
    })

    it('should sync GROUND type when syncType=true', () => {
      thing.isGround = true
      syncFromThingType(item, thing, true)
      expect(item.type).toBe(ServerItemType.GROUND)
    })

    it('should sync CONTAINER type', () => {
      thing.isContainer = true
      syncFromThingType(item, thing, true)
      expect(item.type).toBe(ServerItemType.CONTAINER)
    })

    it('should sync FLUID type', () => {
      thing.isFluidContainer = true
      syncFromThingType(item, thing, true)
      expect(item.type).toBe(ServerItemType.FLUID)
    })

    it('should sync SPLASH type', () => {
      thing.isFluid = true
      syncFromThingType(item, thing, true)
      expect(item.type).toBe(ServerItemType.SPLASH)
    })

    it('should sync NONE type for default', () => {
      syncFromThingType(item, thing, true)
      expect(item.type).toBe(ServerItemType.NONE)
    })

    it('should prioritize GROUND over CONTAINER', () => {
      thing.isGround = true
      thing.isContainer = true
      syncFromThingType(item, thing, true)
      expect(item.type).toBe(ServerItemType.GROUND)
    })
  })

  describe('flag mapping', () => {
    it('should map unpassable', () => {
      thing.isUnpassable = true
      syncFromThingType(item, thing)
      expect(item.unpassable).toBe(true)
    })

    it('should map blockMissiles', () => {
      thing.blockMissile = true
      syncFromThingType(item, thing)
      expect(item.blockMissiles).toBe(true)
    })

    it('should map blockPathfinder', () => {
      thing.blockPathfind = true
      syncFromThingType(item, thing)
      expect(item.blockPathfinder).toBe(true)
    })

    it('should map hasElevation', () => {
      thing.hasElevation = true
      syncFromThingType(item, thing)
      expect(item.hasElevation).toBe(true)
    })

    it('should map multiUse', () => {
      thing.multiUse = true
      syncFromThingType(item, thing)
      expect(item.multiUse).toBe(true)
    })

    it('should map pickupable', () => {
      thing.pickupable = true
      syncFromThingType(item, thing)
      expect(item.pickupable).toBe(true)
    })

    it('should invert movable (isUnmoveable=true -> movable=false)', () => {
      thing.isUnmoveable = true
      syncFromThingType(item, thing)
      expect(item.movable).toBe(false)
    })

    it('should invert movable (isUnmoveable=false -> movable=true)', () => {
      thing.isUnmoveable = false
      syncFromThingType(item, thing)
      expect(item.movable).toBe(true)
    })

    it('should map stackable', () => {
      thing.stackable = true
      syncFromThingType(item, thing)
      expect(item.stackable).toBe(true)
    })

    it('should map readable from writable', () => {
      thing.writable = true
      syncFromThingType(item, thing)
      expect(item.readable).toBe(true)
    })

    it('should map readable from writableOnce', () => {
      thing.writableOnce = true
      syncFromThingType(item, thing)
      expect(item.readable).toBe(true)
    })

    it('should map readable from lensHelp 1112', () => {
      thing.isLensHelp = true
      thing.lensHelp = 1112
      syncFromThingType(item, thing)
      expect(item.readable).toBe(true)
    })

    it('should NOT map readable from other lensHelp values', () => {
      thing.isLensHelp = true
      thing.lensHelp = 1000
      syncFromThingType(item, thing)
      expect(item.readable).toBe(false)
    })

    it('should map rotatable', () => {
      thing.rotatable = true
      syncFromThingType(item, thing)
      expect(item.rotatable).toBe(true)
    })

    it('should map hangable', () => {
      thing.hangable = true
      syncFromThingType(item, thing)
      expect(item.hangable).toBe(true)
    })

    it('should map hookSouth from isVertical', () => {
      thing.isVertical = true
      syncFromThingType(item, thing)
      expect(item.hookSouth).toBe(true)
    })

    it('should map hookEast from isHorizontal', () => {
      thing.isHorizontal = true
      syncFromThingType(item, thing)
      expect(item.hookEast).toBe(true)
    })

    it('should map ignoreLook', () => {
      thing.ignoreLook = true
      syncFromThingType(item, thing)
      expect(item.ignoreLook).toBe(true)
    })

    it('should always set allowDistanceRead to false', () => {
      syncFromThingType(item, thing)
      expect(item.allowDistanceRead).toBe(false)
    })

    it('should always set hasCharges to false', () => {
      thing.hasCharges = true
      syncFromThingType(item, thing)
      expect(item.hasCharges).toBe(false)
    })
  })

  describe('version-specific flags', () => {
    it('should set forceUse=false for versions < 1010', () => {
      thing.forceUse = true
      syncFromThingType(item, thing, false, 960)
      expect(item.forceUse).toBe(false)
    })

    it('should sync forceUse for versions >= 1010', () => {
      thing.forceUse = true
      syncFromThingType(item, thing, false, 1010)
      expect(item.forceUse).toBe(true)
    })

    it('should set fullGround=false for versions < 1010', () => {
      thing.isFullGround = true
      syncFromThingType(item, thing, false, 960)
      expect(item.fullGround).toBe(false)
    })

    it('should sync fullGround for versions >= 1010', () => {
      thing.isFullGround = true
      syncFromThingType(item, thing, false, 1010)
      expect(item.fullGround).toBe(true)
    })
  })

  describe('isAnimation flag', () => {
    it('should set isAnimation=true when frames > 1', () => {
      const thing = makeAnimatedThing()
      syncFromThingType(item, thing)
      expect(item.isAnimation).toBe(true)
    })

    it('should set isAnimation=false when frames = 1', () => {
      const thing = makeGroundThing()
      syncFromThingType(item, thing)
      expect(item.isAnimation).toBe(false)
    })

    it('should set isAnimation=false when no frame group', () => {
      syncFromThingType(item, thing)
      expect(item.isAnimation).toBe(false)
    })
  })

  describe('attribute mapping', () => {
    it('should map light level and color', () => {
      thing.lightLevel = 5
      thing.lightColor = 200
      syncFromThingType(item, thing)
      expect(item.lightLevel).toBe(5)
      expect(item.lightColor).toBe(200)
    })

    it('should map ground speed for ground items', () => {
      thing.isGround = true
      thing.groundSpeed = 150
      syncFromThingType(item, thing, true)
      expect(item.groundSpeed).toBe(150)
    })

    it('should NOT map ground speed for non-ground items', () => {
      thing.groundSpeed = 150
      syncFromThingType(item, thing)
      expect(item.groundSpeed).toBe(0)
    })

    it('should map minimap color', () => {
      thing.miniMapColor = 0x99cc33
      syncFromThingType(item, thing)
      expect(item.minimapColor).toBe(0x99cc33)
    })

    it('should map maxReadWriteChars when writable', () => {
      thing.writable = true
      thing.maxReadWriteChars = 256
      syncFromThingType(item, thing)
      expect(item.maxReadWriteChars).toBe(256)
    })

    it('should set maxReadWriteChars to 0 when not writable', () => {
      thing.writable = false
      thing.maxReadWriteChars = 256
      syncFromThingType(item, thing)
      expect(item.maxReadWriteChars).toBe(0)
    })

    it('should map maxReadChars when writableOnce', () => {
      thing.writableOnce = true
      thing.maxReadChars = 128
      syncFromThingType(item, thing)
      expect(item.maxReadChars).toBe(128)
    })

    it('should set maxReadChars to 0 when not writableOnce', () => {
      thing.writableOnce = false
      thing.maxReadChars = 128
      syncFromThingType(item, thing)
      expect(item.maxReadChars).toBe(0)
    })

    it('should map stack order BORDER for ground border', () => {
      thing.isGroundBorder = true
      syncFromThingType(item, thing)
      expect(item.stackOrder).toBe(TileStackOrder.BORDER)
      expect(item.hasStackOrder).toBe(true)
    })

    it('should map stack order BOTTOM for on bottom', () => {
      thing.isOnBottom = true
      syncFromThingType(item, thing)
      expect(item.stackOrder).toBe(TileStackOrder.BOTTOM)
      expect(item.hasStackOrder).toBe(true)
    })

    it('should map stack order TOP for on top', () => {
      thing.isOnTop = true
      syncFromThingType(item, thing)
      expect(item.stackOrder).toBe(TileStackOrder.TOP)
      expect(item.hasStackOrder).toBe(true)
    })

    it('should map stack order NONE for default', () => {
      syncFromThingType(item, thing)
      expect(item.stackOrder).toBe(TileStackOrder.NONE)
      expect(item.hasStackOrder).toBe(false)
    })

    it('should map name from marketName', () => {
      thing.marketName = 'Golden Armor'
      syncFromThingType(item, thing)
      expect(item.name).toBe('Golden Armor')
    })

    it('should not change name when marketName is empty', () => {
      item.name = 'existing'
      thing.marketName = ''
      syncFromThingType(item, thing)
      expect(item.name).toBe('existing')
    })

    it('should map tradeAs from marketTradeAs', () => {
      thing.marketTradeAs = 1234
      syncFromThingType(item, thing)
      expect(item.tradeAs).toBe(1234)
    })

    it('should not change tradeAs when marketTradeAs is 0', () => {
      item.tradeAs = 999
      thing.marketTradeAs = 0
      syncFromThingType(item, thing)
      expect(item.tradeAs).toBe(999)
    })
  })

  describe('sprite hash', () => {
    it('should compute sprite hash when provider given', () => {
      const thing = makeGroundThing()
      item.type = ServerItemType.GROUND
      const solidPixels = makeSolidPixels()
      syncFromThingType(item, thing, false, 0, (id) => (id === 1 ? solidPixels : null), false)
      expect(item.spriteHash).not.toBeNull()
      expect(item.spriteHash!.length).toBe(16)
      expect(item.spriteAssigned).toBe(true)
    })

    it('should not compute sprite hash for DEPRECATED items', () => {
      item.type = ServerItemType.DEPRECATED
      syncFromThingType(item, thing, false, 0, () => null, false)
      expect(item.spriteHash).toBeNull()
      expect(item.spriteAssigned).toBe(false)
    })

    it('should not compute sprite hash when no provider', () => {
      const thing = makeGroundThing()
      syncFromThingType(item, thing)
      expect(item.spriteAssigned).toBe(false)
    })
  })
})

// =========================================================================
// OtbSync - createFromThingType
// =========================================================================

describe('createFromThingType', () => {
  it('should create item with server ID and client ID', () => {
    const thing = makeThingType({ id: 100 })
    thing.frameGroups[FrameGroupType.DEFAULT] = createFrameGroup()
    thing.frameGroups[FrameGroupType.DEFAULT]!.spriteIndex = [0]
    const item = createFromThingType(thing, 200)
    expect(item.id).toBe(200)
    expect(item.clientId).toBe(100)
  })

  it('should sync type for new items', () => {
    const thing = makeThingType({ isContainer: true, id: 100 })
    thing.frameGroups[FrameGroupType.DEFAULT] = createFrameGroup()
    thing.frameGroups[FrameGroupType.DEFAULT]!.spriteIndex = [0]
    const item = createFromThingType(thing, 200)
    expect(item.type).toBe(ServerItemType.CONTAINER)
  })

  it('should sync flags', () => {
    const thing = makeThingType({ pickupable: true, stackable: true, id: 100 })
    thing.frameGroups[FrameGroupType.DEFAULT] = createFrameGroup()
    thing.frameGroups[FrameGroupType.DEFAULT]!.spriteIndex = [0]
    const item = createFromThingType(thing, 200)
    expect(item.pickupable).toBe(true)
    expect(item.stackable).toBe(true)
  })
})

// =========================================================================
// OtbSync - flagsMatch
// =========================================================================

describe('flagsMatch', () => {
  it('should match when all flags are synced', () => {
    const thing = makeGroundThing()
    thing.isUnpassable = true
    thing.stackable = true
    const item = createServerItem()
    syncFromThingType(item, thing, true)
    expect(flagsMatch(item, thing)).toBe(true)
  })

  it('should not match when type differs', () => {
    const thing = makeGroundThing()
    const item = createServerItem()
    syncFromThingType(item, thing, true)
    item.type = ServerItemType.CONTAINER
    expect(flagsMatch(item, thing)).toBe(false)
  })

  it('should not match when a flag differs', () => {
    const thing = makeGroundThing()
    const item = createServerItem()
    syncFromThingType(item, thing, true)
    item.stackable = !item.stackable
    expect(flagsMatch(item, thing)).toBe(false)
  })

  it('should not match when movable is wrong', () => {
    const thing = makeThingType({ isUnmoveable: true })
    thing.frameGroups[FrameGroupType.DEFAULT] = createFrameGroup()
    thing.frameGroups[FrameGroupType.DEFAULT]!.spriteIndex = [0]
    const item = createServerItem()
    syncFromThingType(item, thing, true)
    item.movable = true // Should be false since isUnmoveable=true
    expect(flagsMatch(item, thing)).toBe(false)
  })

  it('should not match when isAnimation differs', () => {
    const thing = makeAnimatedThing()
    const item = createServerItem()
    syncFromThingType(item, thing, true)
    item.isAnimation = false
    expect(flagsMatch(item, thing)).toBe(false)
  })

  it('should not match when hasCharges is true', () => {
    const thing = makeThingType()
    thing.frameGroups[FrameGroupType.DEFAULT] = createFrameGroup()
    thing.frameGroups[FrameGroupType.DEFAULT]!.spriteIndex = [0]
    const item = createServerItem()
    syncFromThingType(item, thing, true)
    item.hasCharges = true
    expect(flagsMatch(item, thing)).toBe(false)
  })

  it('should check stack order', () => {
    const thing = makeThingType({ isGroundBorder: true })
    thing.frameGroups[FrameGroupType.DEFAULT] = createFrameGroup()
    thing.frameGroups[FrameGroupType.DEFAULT]!.spriteIndex = [0]
    const item = createServerItem()
    syncFromThingType(item, thing, true)
    item.hasStackOrder = false
    expect(flagsMatch(item, thing)).toBe(false)
  })

  it('should match default thing with default item', () => {
    const thing = makeThingType()
    thing.frameGroups[FrameGroupType.DEFAULT] = createFrameGroup()
    thing.frameGroups[FrameGroupType.DEFAULT]!.spriteIndex = [0]
    const item = createServerItem()
    syncFromThingType(item, thing, true)
    expect(flagsMatch(item, thing)).toBe(true)
  })

  it('should check readable char lengths', () => {
    const thing = makeThingType({ writable: true, maxReadWriteChars: 256 })
    thing.frameGroups[FrameGroupType.DEFAULT] = createFrameGroup()
    thing.frameGroups[FrameGroupType.DEFAULT]!.spriteIndex = [0]
    const item = createServerItem()
    syncFromThingType(item, thing, true)
    item.maxReadWriteChars = 100 // Mismatch
    expect(flagsMatch(item, thing)).toBe(false)
  })
})

// =========================================================================
// Server Items Service
// =========================================================================

describe('server-items-service', () => {
  beforeEach(() => {
    resetServerItemsService()
  })

  describe('initial state', () => {
    it('should not be loaded initially', () => {
      expect(isLoaded()).toBe(false)
    })

    it('should return null item list', () => {
      expect(getServerItemList()).toBeNull()
    })

    it('should return null attribute server', () => {
      expect(getAttributeServerName()).toBeNull()
    })
  })

  describe('loadServerItems', () => {
    it('should load from OTB buffer', () => {
      const item = createServerItem()
      item.id = 100
      item.clientId = 100
      const buffer = makeOtbBuffer([item])

      const result = loadServerItems({ otbBuffer: buffer })
      expect(isLoaded()).toBe(true)
      expect(result.itemList.count).toBe(1)
      expect(getItemByServerId(100)).toBeDefined()
    })

    it('should load with XML content', () => {
      const item = createServerItem()
      item.id = 100
      item.clientId = 100
      const buffer = makeOtbBuffer([item])

      const xml = '<?xml version="1.0"?><items><item id="100" name="sword" article="a" /></items>'

      const result = loadServerItems({ otbBuffer: buffer, xmlContent: xml })
      expect(result.missingAttributes).toEqual([])
      const loaded = getItemByServerId(100)
      expect(loaded).toBeDefined()
      expect(loaded!.xmlAttributes).not.toBeNull()
      expect(loaded!.xmlAttributes!['name']).toBe('sword')
    })

    it('should set attribute server', () => {
      const buffer = makeOtbBuffer([])
      loadServerItems({ otbBuffer: buffer, attributeServer: 'tfs1.4' })
      expect(getAttributeServerName()).toBe('tfs1.4')
    })

    it('should report missing XML attributes', () => {
      const item = createServerItem()
      item.id = 100
      item.clientId = 100
      const buffer = makeOtbBuffer([item])

      const xml =
        '<?xml version="1.0"?><items><item id="100"><attribute key="unknownAttr" value="test" /></item></items>'

      const result = loadServerItems({
        otbBuffer: buffer,
        xmlContent: xml,
        attributeServer: 'tfs1.4'
      })
      expect(result.missingAttributes).toContain('unknownAttr')
    })
  })

  describe('saveServerItems', () => {
    it('should throw when no items loaded', () => {
      expect(() => saveServerItems()).toThrow('No server items loaded')
    })

    it('should save to OTB and XML', () => {
      const item = createServerItem()
      item.id = 100
      item.clientId = 100
      const buffer = makeOtbBuffer([item])
      const xml =
        '<?xml version="1.0"?><items><item id="100" name="golden armor" article="a" /></items>'

      loadServerItems({ otbBuffer: buffer, xmlContent: xml, attributeServer: 'tfs1.4' })
      const result = saveServerItems()

      expect(result.otbBuffer).toBeInstanceOf(ArrayBuffer)
      expect(result.otbBuffer.byteLength).toBeGreaterThan(0)
      expect(result.xmlContent).toContain('golden armor')
    })

    it('should use attribute server config for XML write options', () => {
      const item = createServerItem()
      item.id = 100
      item.clientId = 100
      item.xmlAttributes = { name: 'sword' }
      const buffer = makeOtbBuffer([item])

      loadServerItems({ otbBuffer: buffer, attributeServer: 'tfs1.4' })
      const result = saveServerItems()

      // TFS 1.4 uses iso-8859-1 encoding
      expect(result.xmlContent).toContain('iso-8859-1')
    })
  })

  describe('syncItem', () => {
    it('should return false when not loaded', () => {
      const thing = makeThingType()
      expect(syncItem(100, thing)).toBe(false)
    })

    it('should sync a loaded item', () => {
      const item = createServerItem()
      item.id = 100
      item.clientId = 100
      const buffer = makeOtbBuffer([item])
      loadServerItems({ otbBuffer: buffer })

      const thing = makeThingType({ pickupable: true })
      expect(syncItem(100, thing)).toBe(true)

      const synced = getItemByServerId(100)
      expect(synced!.pickupable).toBe(true)
    })

    it('should return false for non-existent item', () => {
      const buffer = makeOtbBuffer([])
      loadServerItems({ otbBuffer: buffer })
      expect(syncItem(999, makeThingType())).toBe(false)
    })
  })

  describe('syncAllItems', () => {
    it('should return 0 when not loaded', () => {
      expect(syncAllItems([])).toBe(0)
    })

    it('should sync matching items', () => {
      const item1 = createServerItem()
      item1.id = 100
      item1.clientId = 100
      const item2 = createServerItem()
      item2.id = 101
      item2.clientId = 101
      const buffer = makeOtbBuffer([item1, item2])
      loadServerItems({ otbBuffer: buffer })

      const thing1 = makeThingType({ id: 100, pickupable: true })
      const thing2 = makeThingType({ id: 101, stackable: true })

      const synced = syncAllItems([thing1, thing2])
      expect(synced).toBe(2)
      expect(getItemByServerId(100)!.pickupable).toBe(true)
      expect(getItemByServerId(101)!.stackable).toBe(true)
    })
  })

  describe('createMissingItems', () => {
    it('should return 0 when not loaded', () => {
      expect(createMissingItems([])).toBe(0)
    })

    it('should create items for missing client IDs', () => {
      const existingItem = createServerItem()
      existingItem.id = 100
      existingItem.clientId = 100
      const buffer = makeOtbBuffer([existingItem])
      loadServerItems({ otbBuffer: buffer })

      const thing101 = makeThingType({ id: 101 })
      thing101.frameGroups[FrameGroupType.DEFAULT] = createFrameGroup()
      thing101.frameGroups[FrameGroupType.DEFAULT]!.spriteIndex = [0]

      const created = createMissingItems([thing101])
      expect(created).toBe(1)

      const list = getServerItemList()!
      expect(list.count).toBe(2)
      expect(list.hasClientId(101)).toBe(true)
    })

    it('should not create duplicates for existing client IDs', () => {
      const existingItem = createServerItem()
      existingItem.id = 100
      existingItem.clientId = 100
      const buffer = makeOtbBuffer([existingItem])
      loadServerItems({ otbBuffer: buffer })

      const thing100 = makeThingType({ id: 100 })
      thing100.frameGroups[FrameGroupType.DEFAULT] = createFrameGroup()
      thing100.frameGroups[FrameGroupType.DEFAULT]!.spriteIndex = [0]

      const created = createMissingItems([thing100])
      expect(created).toBe(0)
    })
  })

  describe('findOutOfSyncItems', () => {
    it('should return empty when not loaded', () => {
      expect(findOutOfSyncItems([])).toEqual([])
    })

    it('should find items with mismatched flags', () => {
      const item = createServerItem()
      item.id = 100
      item.clientId = 100
      item.stackable = true // Will not match default ThingType
      const buffer = makeOtbBuffer([item])
      loadServerItems({ otbBuffer: buffer })

      const thing = makeThingType({ id: 100 }) // stackable = false
      thing.frameGroups[FrameGroupType.DEFAULT] = createFrameGroup()
      thing.frameGroups[FrameGroupType.DEFAULT]!.spriteIndex = [0]

      const outOfSync = findOutOfSyncItems([thing])
      expect(outOfSync).toContain(100)
    })
  })

  describe('item access helpers', () => {
    it('should get by server ID', () => {
      const item = createServerItem()
      item.id = 100
      item.clientId = 50
      const buffer = makeOtbBuffer([item])
      loadServerItems({ otbBuffer: buffer })

      expect(getItemByServerId(100)).toBeDefined()
      expect(getItemByServerId(999)).toBeUndefined()
    })

    it('should get by client ID', () => {
      const item = createServerItem()
      item.id = 100
      item.clientId = 50
      const buffer = makeOtbBuffer([item])
      loadServerItems({ otbBuffer: buffer })

      expect(getItemsByClientId(50)).toHaveLength(1)
      expect(getItemsByClientId(999)).toHaveLength(0)
    })

    it('should get first item by client ID', () => {
      const item = createServerItem()
      item.id = 100
      item.clientId = 50
      const buffer = makeOtbBuffer([item])
      loadServerItems({ otbBuffer: buffer })

      expect(getFirstItemByClientId(50)).toBeDefined()
      expect(getFirstItemByClientId(999)).toBeUndefined()
    })
  })

  describe('applyServerItemNames', () => {
    it('should apply items.xml name to thing.name', () => {
      const item = createServerItem()
      item.id = 100
      item.clientId = 100
      item.name = 'otb sword'
      const buffer = makeOtbBuffer([item])
      const xml = '<?xml version="1.0"?><items><item id="100" name="xml sword" /></items>'

      loadServerItems({ otbBuffer: buffer, xmlContent: xml })

      const thing = makeThingType({ id: 100, name: '' })
      const result = applyServerItemNames([thing])

      expect(result[0]).not.toBe(thing)
      expect(result[0].name).toBe('xml sword')
    })

    it('should fall back to OTB name when XML name is missing', () => {
      const item = createServerItem()
      item.id = 100
      item.clientId = 100
      item.name = 'otb sword'
      const buffer = makeOtbBuffer([item])

      loadServerItems({ otbBuffer: buffer })

      const thing = makeThingType({ id: 100, name: '' })
      const result = applyServerItemNames([thing])

      expect(result[0].name).toBe('otb sword')
    })

    it('should keep original thing array when nothing changes', () => {
      const item = createServerItem()
      item.id = 100
      item.clientId = 100
      item.name = 'same name'
      const buffer = makeOtbBuffer([item])

      loadServerItems({ otbBuffer: buffer })

      const thing = makeThingType({ id: 100, name: 'same name' })
      const result = applyServerItemNames([thing])

      expect(result).toEqual([thing])
      expect(result[0]).toBe(thing)
    })
  })

  describe('setAttributeServer', () => {
    it('should set attribute server name', () => {
      setAttributeServer('tfs1.0')
      expect(getAttributeServerName()).toBe('tfs1.0')
    })
  })

  describe('unloadServerItems', () => {
    it('should clear all state', () => {
      const buffer = makeOtbBuffer([])
      loadServerItems({ otbBuffer: buffer, attributeServer: 'tfs1.4' })
      expect(isLoaded()).toBe(true)

      unloadServerItems()
      expect(isLoaded()).toBe(false)
      expect(getServerItemList()).toBeNull()
      expect(getAttributeServerName()).toBeNull()
    })
  })

  describe('round-trip: load -> save -> reload', () => {
    it('should preserve items through save/reload cycle', () => {
      const item = createServerItem()
      item.id = 100
      item.clientId = 100
      item.unpassable = true
      item.lightLevel = 5
      const buffer = makeOtbBuffer([item])
      const xml =
        '<?xml version="1.0"?><items><item id="100" name="golden armor" article="a" /></items>'

      loadServerItems({ otbBuffer: buffer, xmlContent: xml, attributeServer: 'tfs1.4' })

      const saved = saveServerItems()

      resetServerItemsService()

      const reloaded = loadServerItems({
        otbBuffer: saved.otbBuffer,
        xmlContent: saved.xmlContent,
        attributeServer: 'tfs1.4'
      })

      expect(reloaded.itemList.count).toBe(1)
      const reloadedItem = getItemByServerId(100)!
      expect(reloadedItem.unpassable).toBe(true)
      expect(reloadedItem.lightLevel).toBe(5)
      expect(reloadedItem.xmlAttributes!['name']).toBe('golden armor')
    })
  })
})
