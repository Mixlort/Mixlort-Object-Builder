/**
 * High-level Server Items service.
 * Manages the loaded ServerItemList, integrates OTB reader/writer with
 * items.xml reader/writer, and provides synchronization with ThingType data.
 *
 * Uses module-level state (same pattern as item-attribute-storage.ts).
 *
 * Ported from legacy ObjectBuilder integration of OTB/XML loading, saving,
 * and OtbSync usage.
 */

import { type ThingType, type ServerItem, type XmlAttributeValue, cloneThingType } from '../../types'
import { readOtb, writeOtb, ServerItemList } from '../otb'
import { readItemsXml, writeItemsXml, type ItemsXmlWriteOptions } from '../items-xml'
import {
  loadServer as loadAttributeServer,
  getAttributeKeysInOrder,
  getTagAttributeKeys,
  getAttributePriority,
  getSupportsFromToId,
  getItemsXmlEncoding
} from '../item-attributes'
import { syncFromThingType, createFromThingType, flagsMatch } from './otb-sync'
import { type SpritePixelProvider } from './sprite-hash'

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let _itemList: ServerItemList | null = null
let _attributeServer: string | null = null

// ---------------------------------------------------------------------------
// State access
// ---------------------------------------------------------------------------

/**
 * Returns the currently loaded ServerItemList, or null if not loaded.
 */
export function getServerItemList(): ServerItemList | null {
  return _itemList
}

/**
 * Returns true if server items are loaded.
 */
export function isLoaded(): boolean {
  return _itemList !== null
}

/**
 * Returns the currently set attribute server name.
 */
export function getAttributeServerName(): string | null {
  return _attributeServer
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

export interface LoadServerItemsOptions {
  /** Raw OTB file buffer */
  otbBuffer: ArrayBuffer
  /** Raw items.xml content (optional) */
  xmlContent?: string
  /** TFS attribute server name (e.g. 'tfs1.4') for known attributes */
  attributeServer?: string
}

export interface LoadServerItemsResult {
  /** Loaded item list */
  itemList: ServerItemList
  /** Unknown nested attributes found in XML */
  missingAttributes: string[]
  /** Unknown tag attributes found in XML */
  missingTagAttributes: string[]
}

/**
 * Loads server items from OTB buffer and optionally populates XML attributes.
 *
 * @param options OTB buffer, optional XML content, optional attribute server
 * @returns Load result with item list and missing attribute reports
 */
export function loadServerItems(options: LoadServerItemsOptions): LoadServerItemsResult {
  const { otbBuffer, xmlContent, attributeServer } = options

  // Read OTB
  const otbResult = readOtb(otbBuffer)
  _itemList = otbResult.items

  // Set attribute server
  _attributeServer = attributeServer ?? null
  if (_attributeServer) {
    loadAttributeServer(_attributeServer)
  }

  let missingAttributes: string[] = []
  let missingTagAttributes: string[] = []

  // Read XML if provided
  if (xmlContent && _itemList) {
    const knownAttributes = _attributeServer ? (getAttributeKeysInOrder() ?? []) : undefined
    const knownTagAttributes = _attributeServer ? (getTagAttributeKeys() ?? []) : undefined

    const xmlResult = readItemsXml(xmlContent, _itemList, {
      knownAttributes: knownAttributes ?? undefined,
      knownTagAttributes: knownTagAttributes ?? undefined
    })

    missingAttributes = xmlResult.missingAttributes
    missingTagAttributes = xmlResult.missingTagAttributes
  }

  return { itemList: _itemList, missingAttributes, missingTagAttributes }
}

// ---------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------

export interface SaveServerItemsResult {
  /** OTB binary buffer */
  otbBuffer: ArrayBuffer
  /** XML content string */
  xmlContent: string
}

/**
 * Saves the currently loaded server items to OTB and XML formats.
 *
 * @returns Object with otbBuffer and xmlContent
 * @throws Error if no items are loaded
 */
export function saveServerItems(): SaveServerItemsResult {
  if (!_itemList) {
    throw new Error('No server items loaded')
  }

  // Build write options from attribute server config
  const writeOptions: ItemsXmlWriteOptions = {}

  if (_attributeServer) {
    writeOptions.encoding = getItemsXmlEncoding(_attributeServer)
    writeOptions.supportsFromToId = getSupportsFromToId(_attributeServer)

    const tagKeys = getTagAttributeKeys()
    if (tagKeys && tagKeys.length > 0) {
      writeOptions.tagAttributeKeys = tagKeys
    }

    const priority = getAttributePriority()
    if (priority && Object.keys(priority).length > 0) {
      writeOptions.attributePriority = priority
    }
  }

  const otbBuffer = writeOtb(_itemList)
  const xmlContent = writeItemsXml(_itemList, writeOptions)

  return { otbBuffer, xmlContent }
}

// ---------------------------------------------------------------------------
// Synchronization
// ---------------------------------------------------------------------------

/**
 * Syncs a single ServerItem's flags and attributes from a ThingType.
 * Updates the item in the loaded list in place.
 *
 * @param serverId Server ID of the item to sync
 * @param thingType ThingType with current flag values
 * @param clientVersion Client version for flag filtering
 * @param getCompressedPixels Optional sprite pixel provider for hash computation
 * @param transparent Whether sprites use transparency mode
 * @returns true if item was found and synced
 */
export function syncItem(
  serverId: number,
  thingType: ThingType,
  clientVersion = 0,
  getCompressedPixels?: SpritePixelProvider,
  transparent = false
): boolean {
  if (!_itemList) return false

  const item = _itemList.getByServerId(serverId)
  if (!item) return false

  syncFromThingType(item, thingType, false, clientVersion, getCompressedPixels, transparent)
  return true
}

/**
 * Syncs all loaded items that have matching client IDs from the provided ThingTypes.
 * Used for bulk reload of attributes.
 *
 * @param thingTypes Array of ThingTypes to sync from
 * @param clientVersion Client version for flag filtering
 * @param getCompressedPixels Optional sprite pixel provider for hash computation
 * @param transparent Whether sprites use transparency mode
 * @returns Number of items synced
 */
export function syncAllItems(
  thingTypes: ThingType[],
  clientVersion = 0,
  getCompressedPixels?: SpritePixelProvider,
  transparent = false
): number {
  if (!_itemList) return 0

  let synced = 0
  for (const thingType of thingTypes) {
    const items = _itemList.getItemsByClientId(thingType.id)
    for (const item of items) {
      if (item.type !== 5) {
        // Skip DEPRECATED
        syncFromThingType(item, thingType, false, clientVersion, getCompressedPixels, transparent)
        synced++
      }
    }
  }

  return synced
}

/**
 * Creates missing server items for client IDs not present in the OTB.
 * Each new item is synced from the corresponding ThingType.
 *
 * @param thingTypes All item ThingTypes from DAT
 * @param clientVersion Client version for flag filtering
 * @param getCompressedPixels Optional sprite pixel provider for hash computation
 * @param transparent Whether sprites use transparency mode
 * @returns Number of items created
 */
export function createMissingItems(
  thingTypes: ThingType[],
  clientVersion = 0,
  getCompressedPixels?: SpritePixelProvider,
  transparent = false
): number {
  if (!_itemList) return 0

  let created = 0
  for (const thingType of thingTypes) {
    // Check if any server item already maps to this client ID
    if (_itemList.hasClientId(thingType.id)) continue

    const serverId = _itemList.maxId + 1
    const newItem = createFromThingType(
      thingType,
      serverId,
      clientVersion,
      getCompressedPixels,
      transparent
    )
    _itemList.add(newItem)
    created++
  }

  return created
}

/**
 * Checks which items need reloading (flags don't match ThingType).
 *
 * @param thingTypes Array of ThingTypes to check against
 * @returns Array of server IDs that need reloading
 */
export function findOutOfSyncItems(thingTypes: ThingType[]): number[] {
  if (!_itemList) return []

  const outOfSync: number[] = []
  for (const thingType of thingTypes) {
    const items = _itemList.getItemsByClientId(thingType.id)
    for (const item of items) {
      if (item.type !== 5 && !flagsMatch(item, thingType)) {
        // Skip DEPRECATED
        outOfSync.push(item.id)
      }
    }
  }

  return outOfSync
}

// ---------------------------------------------------------------------------
// Item access helpers
// ---------------------------------------------------------------------------

/**
 * Gets a ServerItem by its server ID.
 */
export function getItemByServerId(serverId: number): ServerItem | undefined {
  return _itemList?.getByServerId(serverId)
}

/**
 * Gets all ServerItems that map to a given client ID.
 */
export function getItemsByClientId(clientId: number): ServerItem[] {
  return _itemList?.getItemsByClientId(clientId) ?? []
}

/**
 * Gets the first ServerItem that maps to a given client ID.
 */
export function getFirstItemByClientId(clientId: number): ServerItem | undefined {
  return _itemList?.getFirstItemByClientId(clientId)
}

/**
 * Gets string-based XML attributes for the first ServerItem matching a client ID.
 * Nested XML attributes are excluded because the editor only exposes flat key/value pairs.
 */
export function getEditableXmlAttributes(clientId: number): Record<string, string> | null {
  const item = getFirstItemByClientId(clientId)
  if (!item?.xmlAttributes) {
    return null
  }

  const editableEntries = Object.entries(item.xmlAttributes).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string'
  )

  return editableEntries.length > 0 ? Object.fromEntries(editableEntries) : null
}

/**
 * Replaces string-based XML attributes for all ServerItems matching a client ID while
 * preserving nested XML attributes that are not editable in the renderer.
 *
 * @returns Number of server items updated
 */
export function setEditableXmlAttributes(
  clientId: number,
  xmlAttributes: Record<string, string> | null
): number {
  if (!_itemList) {
    return 0
  }

  const items = _itemList.getItemsByClientId(clientId)
  if (items.length === 0) {
    return 0
  }

  for (const item of items) {
    const nextAttributes: Record<string, XmlAttributeValue> = {}

    if (item.xmlAttributes) {
      for (const [key, value] of Object.entries(item.xmlAttributes)) {
        if (typeof value !== 'string') {
          nextAttributes[key] = value
        }
      }
    }

    if (xmlAttributes) {
      for (const [key, value] of Object.entries(xmlAttributes)) {
        nextAttributes[key] = value
      }
    }

    item.xmlAttributes = Object.keys(nextAttributes).length > 0 ? nextAttributes : null
  }

  return items.length
}

function getServerItemDisplayName(item: ServerItem | undefined): string {
  if (!item) return ''

  const xmlName = item.xmlAttributes?.['name']
  if (typeof xmlName === 'string' && xmlName.trim().length > 0) {
    return xmlName.trim()
  }

  return item.name.trim()
}

/**
 * Applies server item display names to client ThingTypes.
 * Priority: items.xml `name` attribute, then OTB name attribute.
 */
export function applyServerItemNames(thingTypes: ThingType[]): ThingType[] {
  if (!_itemList || thingTypes.length === 0) {
    return thingTypes
  }

  let changed = false
  const decorated = thingTypes.map((thing) => {
    const displayName = getServerItemDisplayName(_itemList?.getFirstItemByClientId(thing.id))
    if (!displayName || displayName === thing.name) {
      return thing
    }

    const updated = cloneThingType(thing)
    updated.name = displayName
    changed = true
    return updated
  })

  return changed ? decorated : thingTypes
}

/**
 * Sets the attribute server to use for XML operations.
 */
export function setAttributeServer(serverName: string): void {
  _attributeServer = serverName
  loadAttributeServer(serverName)
}

// ---------------------------------------------------------------------------
// Unload / Reset
// ---------------------------------------------------------------------------

/**
 * Unloads server items and resets state.
 */
export function unloadServerItems(): void {
  _itemList?.clear()
  _itemList = null
  _attributeServer = null
}

/**
 * Resets all module state. For testing only.
 */
export function resetServerItemsService(): void {
  _itemList = null
  _attributeServer = null
}
