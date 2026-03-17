// OTB sync (ThingType <-> ServerItem)
export { syncFromThingType, createFromThingType, flagsMatch } from './otb-sync'

// Sprite hash computation
export { computeSpriteHash } from './sprite-hash'
export type { SpritePixelProvider } from './sprite-hash'

// MD5 hash
export { md5 } from './md5'

// Server items service (high-level state management)
export {
  getServerItemList,
  isLoaded,
  getAttributeServerName,
  loadServerItems,
  saveServerItems,
  syncItem,
  syncAllItems,
  createMissingItems,
  findOutOfSyncItems,
  getItemByServerId,
  getItemsByClientId,
  getFirstItemByClientId,
  applyServerItemNames,
  setAttributeServer,
  unloadServerItems,
  resetServerItemsService
} from './server-items-service'

export type {
  LoadServerItemsOptions,
  LoadServerItemsResult,
  SaveServerItemsResult
} from './server-items-service'
