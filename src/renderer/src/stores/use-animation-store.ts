/**
 * Animation store for managing frame group editing, playback state,
 * frame durations, and animation configuration.
 *
 * Ported from legacy AS3: Animator (playback runtime), ThingDataView (play/pause/stop),
 * FrameList (frame editing), AnimationEditor (configuration). Frame duration editing
 * and animation mode config are managed here as editable state.
 */

import { create } from 'zustand'
import {
  type FrameGroup,
  type FrameDuration,
  type FrameGroupType,
  type AnimationMode,
  AnimationMode as AnimationModeConst,
  FrameGroupType as FrameGroupTypeConst,
  cloneFrameGroup,
  createFrameDuration,
  cloneFrameDuration,
  getFrameDurationValue
} from '../types'

// ---------------------------------------------------------------------------
// Playback direction (for ping-pong mode)
// ---------------------------------------------------------------------------

export const PlaybackDirection = {
  FORWARD: 0,
  BACKWARD: 1
} as const

export type PlaybackDirection = (typeof PlaybackDirection)[keyof typeof PlaybackDirection]

// ---------------------------------------------------------------------------
// Frame constants (ported from Animator.as)
// ---------------------------------------------------------------------------

export const FRAME_AUTOMATIC = -1
export const FRAME_RANDOM = 0xfe
export const FRAME_ASYNCHRONOUS = 0xff

// ---------------------------------------------------------------------------
// Animation store state + actions
// ---------------------------------------------------------------------------

export interface AnimationStoreState {
  /** Current frame group being edited/previewed (clone of original). */
  frameGroup: FrameGroup | null
  /** Active frame group type (DEFAULT or WALKING). */
  frameGroupType: FrameGroupType

  /** Current frame index for display/editing. */
  currentFrame: number
  /** Whether playback is active. */
  isPlaying: boolean
  /** Playback speed multiplier (1.0 = normal). */
  playbackSpeed: number

  /** Current direction for ping-pong playback. */
  playbackDirection: PlaybackDirection
  /** Current loop iteration. */
  currentLoop: number
  /** Whether the animation cycle is complete. */
  isComplete: boolean

  /** Last update timestamp in ms (for timing). -1 = uninitialized. */
  lastUpdateTime: number
  /** Remaining duration for the current frame in ms. */
  currentFrameRemaining: number

  /** Whether the frame group has been modified since loading. */
  isChanged: boolean
}

export interface AnimationStoreActions {
  // Frame group management
  setFrameGroup(frameGroup: FrameGroup, type?: FrameGroupType): void
  clearFrameGroup(): void
  setFrameGroupType(type: FrameGroupType): void

  // Playback controls
  play(): void
  pause(): void
  stop(): void
  togglePlayback(): void
  setPlaybackSpeed(speed: number): void

  // Frame navigation
  setCurrentFrame(frame: number): void
  nextFrame(): void
  prevFrame(): void
  firstFrame(): void
  lastFrame(): void

  // Animation tick (called from requestAnimationFrame loop)
  update(currentTime: number): void
  resetPlayback(): void

  // Frame duration editing
  setFrameDuration(frameIndex: number, duration: FrameDuration): void
  setAllFrameDurations(duration: FrameDuration): void

  // Frame management
  addFrame(duration?: FrameDuration): void
  removeFrame(frameIndex: number): void
  duplicateFrame(frameIndex: number): void

  // Animation configuration
  setAnimationMode(mode: AnimationMode): void
  setLoopCount(count: number): void
  setStartFrame(frame: number): void

  // Getters
  getFrameCount(): number
  getFrameDuration(frameIndex: number): FrameDuration | null
  getCurrentFrameDuration(): FrameDuration | null
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_PLAYBACK_SPEED = 1.0
const DEFAULT_FRAME_DURATION_MS = 100

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Calculate the number of sprite slots per frame. */
function spritesPerFrame(fg: FrameGroup): number {
  return fg.width * fg.height * fg.layers * fg.patternX * fg.patternY * fg.patternZ
}

/** Get a resolved frame duration value for a specific frame. */
function resolveFrameDuration(fg: FrameGroup, frameIndex: number): number {
  const sanitizeDuration = (value: number): number =>
    Number.isFinite(value) && value > 0 ? value : DEFAULT_FRAME_DURATION_MS

  if (fg.frameDurations && frameIndex >= 0 && frameIndex < fg.frameDurations.length) {
    return sanitizeDuration(getFrameDurationValue(fg.frameDurations[frameIndex]))
  }
  return DEFAULT_FRAME_DURATION_MS
}

// ---------------------------------------------------------------------------
// Store creation
// ---------------------------------------------------------------------------

export const useAnimationStore = create<AnimationStoreState & AnimationStoreActions>()(
  (set, get) => ({
    // --- Initial state ---
    frameGroup: null,
    frameGroupType: FrameGroupTypeConst.DEFAULT,
    currentFrame: 0,
    isPlaying: false,
    playbackSpeed: DEFAULT_PLAYBACK_SPEED,
    playbackDirection: PlaybackDirection.FORWARD,
    currentLoop: 0,
    isComplete: false,
    lastUpdateTime: -1,
    currentFrameRemaining: 0,
    isChanged: false,

    // --- Frame group management ---

    setFrameGroup(frameGroup, type) {
      const cloned = cloneFrameGroup(frameGroup)
      const duration = resolveFrameDuration(cloned, 0)
      set({
        frameGroup: cloned,
        frameGroupType: type ?? cloned.type,
        currentFrame: 0,
        isPlaying: false,
        playbackSpeed: DEFAULT_PLAYBACK_SPEED,
        playbackDirection: PlaybackDirection.FORWARD,
        currentLoop: 0,
        isComplete: false,
        lastUpdateTime: -1,
        currentFrameRemaining: duration,
        isChanged: false
      })
    },

    clearFrameGroup() {
      set({
        frameGroup: null,
        frameGroupType: FrameGroupTypeConst.DEFAULT,
        currentFrame: 0,
        isPlaying: false,
        playbackSpeed: DEFAULT_PLAYBACK_SPEED,
        playbackDirection: PlaybackDirection.FORWARD,
        currentLoop: 0,
        isComplete: false,
        lastUpdateTime: -1,
        currentFrameRemaining: 0,
        isChanged: false
      })
    },

    setFrameGroupType(type) {
      set({ frameGroupType: type })
    },

    // --- Playback controls ---

    play() {
      const { frameGroup, isComplete } = get()
      if (!frameGroup || frameGroup.frames <= 1) return

      if (isComplete) {
        // Restart from beginning if animation was complete
        const duration = resolveFrameDuration(frameGroup, 0)
        set({
          isPlaying: true,
          isComplete: false,
          currentFrame: 0,
          currentLoop: 0,
          playbackDirection: PlaybackDirection.FORWARD,
          lastUpdateTime: -1,
          currentFrameRemaining: duration
        })
      } else {
        set({ isPlaying: true, lastUpdateTime: -1 })
      }
    },

    pause() {
      set({ isPlaying: false })
    },

    stop() {
      const { frameGroup } = get()
      const duration = frameGroup ? resolveFrameDuration(frameGroup, 0) : 0
      set({
        isPlaying: false,
        currentFrame: 0,
        playbackDirection: PlaybackDirection.FORWARD,
        currentLoop: 0,
        isComplete: false,
        lastUpdateTime: -1,
        currentFrameRemaining: duration
      })
    },

    togglePlayback() {
      const { isPlaying } = get()
      if (isPlaying) {
        get().pause()
      } else {
        get().play()
      }
    },

    setPlaybackSpeed(speed) {
      set({ playbackSpeed: Math.max(0.1, Math.min(speed, 10.0)) })
    },

    // --- Frame navigation ---

    setCurrentFrame(frame) {
      const { frameGroup } = get()
      if (!frameGroup) return
      const clamped = Math.max(0, Math.min(frame, frameGroup.frames - 1))
      const duration = resolveFrameDuration(frameGroup, clamped)
      set({ currentFrame: clamped, currentFrameRemaining: duration })
    },

    nextFrame() {
      const { frameGroup, currentFrame } = get()
      if (!frameGroup) return
      const next = (currentFrame + 1) % frameGroup.frames
      const duration = resolveFrameDuration(frameGroup, next)
      set({ currentFrame: next, currentFrameRemaining: duration })
    },

    prevFrame() {
      const { frameGroup, currentFrame } = get()
      if (!frameGroup) return
      const prev = currentFrame === 0 ? frameGroup.frames - 1 : currentFrame - 1
      const duration = resolveFrameDuration(frameGroup, prev)
      set({ currentFrame: prev, currentFrameRemaining: duration })
    },

    firstFrame() {
      const { frameGroup } = get()
      if (!frameGroup) return
      const duration = resolveFrameDuration(frameGroup, 0)
      set({ currentFrame: 0, currentFrameRemaining: duration })
    },

    lastFrame() {
      const { frameGroup } = get()
      if (!frameGroup) return
      const last = frameGroup.frames - 1
      const duration = resolveFrameDuration(frameGroup, last)
      set({ currentFrame: last, currentFrameRemaining: duration })
    },

    // --- Animation tick ---

    update(currentTime) {
      const state = get()
      if (!state.isPlaying || !state.frameGroup || state.isComplete) return

      const fg = state.frameGroup

      // First call: initialize lastUpdateTime
      if (state.lastUpdateTime < 0) {
        set({ lastUpdateTime: currentTime })
        return
      }

      const elapsed = (currentTime - state.lastUpdateTime) * state.playbackSpeed
      let remaining = state.currentFrameRemaining - elapsed
      let frame = state.currentFrame
      let loop = state.currentLoop
      let direction = state.playbackDirection
      let complete = false

      // Advance frames while we have excess time
      while (remaining <= 0 && !complete) {
        if (fg.loopCount < 0) {
          // Ping-pong mode
          if (direction === PlaybackDirection.FORWARD) {
            if (frame >= fg.frames - 1) {
              direction = PlaybackDirection.BACKWARD
              frame = fg.frames - 2
            } else {
              frame++
            }
          } else {
            if (frame <= 0) {
              direction = PlaybackDirection.FORWARD
              frame = 1
              loop++
              if (Math.abs(fg.loopCount) > 0 && loop >= Math.abs(fg.loopCount)) {
                complete = true
                frame = 0
              }
            } else {
              frame--
            }
          }
        } else {
          // Standard loop
          frame++
          if (frame >= fg.frames) {
            frame = 0
            loop++
            if (fg.loopCount > 0 && loop >= fg.loopCount) {
              complete = true
              frame = fg.frames - 1
            }
          }
        }

        // Clamp frame
        frame = Math.max(0, Math.min(frame, fg.frames - 1))
        remaining += resolveFrameDuration(fg, frame)
      }

      set({
        currentFrame: frame,
        currentLoop: loop,
        playbackDirection: direction,
        isComplete: complete,
        isPlaying: !complete,
        lastUpdateTime: currentTime,
        currentFrameRemaining: Math.max(0, remaining)
      })
    },

    resetPlayback() {
      const { frameGroup } = get()
      const duration = frameGroup ? resolveFrameDuration(frameGroup, 0) : 0
      set({
        currentFrame: 0,
        isPlaying: false,
        playbackDirection: PlaybackDirection.FORWARD,
        currentLoop: 0,
        isComplete: false,
        lastUpdateTime: -1,
        currentFrameRemaining: duration
      })
    },

    // --- Frame duration editing ---

    setFrameDuration(frameIndex, duration) {
      const { frameGroup, currentFrame } = get()
      if (!frameGroup || !frameGroup.frameDurations) return
      if (frameIndex < 0 || frameIndex >= frameGroup.frameDurations.length) return

      const newFg = cloneFrameGroup(frameGroup)
      if (newFg.frameDurations) {
        newFg.frameDurations[frameIndex] = cloneFrameDuration(duration)
      }

      // If editing the current frame's duration, update remaining time
      const updates: Partial<AnimationStoreState> = { frameGroup: newFg, isChanged: true }
      if (frameIndex === currentFrame) {
        updates.currentFrameRemaining = resolveFrameDuration(newFg, frameIndex)
      }
      set(updates)
    },

    setAllFrameDurations(duration) {
      const { frameGroup } = get()
      if (!frameGroup || !frameGroup.frameDurations) return

      const newFg = cloneFrameGroup(frameGroup)
      if (newFg.frameDurations) {
        for (let i = 0; i < newFg.frameDurations.length; i++) {
          newFg.frameDurations[i] = cloneFrameDuration(duration)
        }
      }
      set({ frameGroup: newFg, isChanged: true })
    },

    // --- Frame management ---

    addFrame(duration) {
      const { frameGroup } = get()
      if (!frameGroup) return

      const newFg = cloneFrameGroup(frameGroup)
      newFg.frames++

      // Add sprite slots for the new frame
      const slotsPerFrame = spritesPerFrame(newFg)
      for (let i = 0; i < slotsPerFrame; i++) {
        newFg.spriteIndex.push(0)
      }

      // Add frame duration
      const fd = duration
        ? cloneFrameDuration(duration)
        : createFrameDuration(DEFAULT_FRAME_DURATION_MS, DEFAULT_FRAME_DURATION_MS)
      if (newFg.frameDurations) {
        newFg.frameDurations.push(fd)
      } else {
        newFg.frameDurations = [fd]
      }

      // Mark as animation if now multi-frame
      if (newFg.frames > 1) {
        newFg.isAnimation = true
      }

      set({ frameGroup: newFg, isChanged: true })
    },

    removeFrame(frameIndex) {
      const { frameGroup, currentFrame } = get()
      if (!frameGroup || frameGroup.frames <= 1) return
      if (frameIndex < 0 || frameIndex >= frameGroup.frames) return

      const newFg = cloneFrameGroup(frameGroup)
      const slotsPerFrame = spritesPerFrame(newFg)

      // Remove sprite slots for this frame
      const startSlot = frameIndex * slotsPerFrame
      newFg.spriteIndex.splice(startSlot, slotsPerFrame)

      // Remove frame duration
      if (newFg.frameDurations && frameIndex < newFg.frameDurations.length) {
        newFg.frameDurations.splice(frameIndex, 1)
      }

      newFg.frames--

      // Update animation flag
      if (newFg.frames <= 1) {
        newFg.isAnimation = false
      }

      // Adjust current frame if needed
      const newCurrentFrame = currentFrame >= newFg.frames ? newFg.frames - 1 : currentFrame
      const newDuration = resolveFrameDuration(newFg, newCurrentFrame)

      set({
        frameGroup: newFg,
        currentFrame: newCurrentFrame,
        currentFrameRemaining: newDuration,
        isChanged: true
      })
    },

    duplicateFrame(frameIndex) {
      const { frameGroup } = get()
      if (!frameGroup) return
      if (frameIndex < 0 || frameIndex >= frameGroup.frames) return

      const newFg = cloneFrameGroup(frameGroup)
      const slotsPerFrame = spritesPerFrame(newFg)

      // Copy sprite slots from the source frame
      const startSlot = frameIndex * slotsPerFrame
      const copiedSlots = newFg.spriteIndex.slice(startSlot, startSlot + slotsPerFrame)
      newFg.spriteIndex.splice(startSlot + slotsPerFrame, 0, ...copiedSlots)

      // Copy frame duration
      if (newFg.frameDurations && frameIndex < newFg.frameDurations.length) {
        const copiedDuration = cloneFrameDuration(newFg.frameDurations[frameIndex])
        newFg.frameDurations.splice(frameIndex + 1, 0, copiedDuration)
      }

      newFg.frames++

      // Mark as animation
      if (newFg.frames > 1) {
        newFg.isAnimation = true
      }

      set({ frameGroup: newFg, isChanged: true })
    },

    // --- Animation configuration ---

    setAnimationMode(mode) {
      const { frameGroup } = get()
      if (!frameGroup) return

      const newFg = cloneFrameGroup(frameGroup)
      newFg.animationMode = mode
      set({ frameGroup: newFg, isChanged: true })
    },

    setLoopCount(count) {
      const { frameGroup } = get()
      if (!frameGroup) return

      const newFg = cloneFrameGroup(frameGroup)
      newFg.loopCount = count
      set({ frameGroup: newFg, isChanged: true })
    },

    setStartFrame(frame) {
      const { frameGroup } = get()
      if (!frameGroup) return

      const newFg = cloneFrameGroup(frameGroup)
      newFg.startFrame = frame
      set({ frameGroup: newFg, isChanged: true })
    },

    // --- Getters ---

    getFrameCount() {
      const { frameGroup } = get()
      return frameGroup ? frameGroup.frames : 0
    },

    getFrameDuration(frameIndex) {
      const { frameGroup } = get()
      if (!frameGroup || !frameGroup.frameDurations) return null
      if (frameIndex < 0 || frameIndex >= frameGroup.frameDurations.length) return null
      return frameGroup.frameDurations[frameIndex]
    },

    getCurrentFrameDuration() {
      const { frameGroup, currentFrame } = get()
      if (!frameGroup || !frameGroup.frameDurations) return null
      if (currentFrame < 0 || currentFrame >= frameGroup.frameDurations.length) return null
      return frameGroup.frameDurations[currentFrame]
    }
  })
)

// ---------------------------------------------------------------------------
// Reset helper (for testing)
// ---------------------------------------------------------------------------

export function resetAnimationStore(): void {
  useAnimationStore.setState({
    frameGroup: null,
    frameGroupType: FrameGroupTypeConst.DEFAULT,
    currentFrame: 0,
    isPlaying: false,
    playbackSpeed: DEFAULT_PLAYBACK_SPEED,
    playbackDirection: PlaybackDirection.FORWARD,
    currentLoop: 0,
    isComplete: false,
    lastUpdateTime: -1,
    currentFrameRemaining: 0,
    isChanged: false
  })
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export const selectFrameGroup = (state: AnimationStoreState) => state.frameGroup
export const selectFrameGroupType = (state: AnimationStoreState) => state.frameGroupType
export const selectCurrentFrame = (state: AnimationStoreState) => state.currentFrame
export const selectIsPlaying = (state: AnimationStoreState) => state.isPlaying
export const selectPlaybackSpeed = (state: AnimationStoreState) => state.playbackSpeed
export const selectPlaybackDirection = (state: AnimationStoreState) => state.playbackDirection
export const selectCurrentLoop = (state: AnimationStoreState) => state.currentLoop
export const selectIsComplete = (state: AnimationStoreState) => state.isComplete
export const selectIsAnimationChanged = (state: AnimationStoreState) => state.isChanged
export const selectCurrentFrameRemaining = (state: AnimationStoreState) =>
  state.currentFrameRemaining
export const selectHasFrameGroup = (state: AnimationStoreState) => state.frameGroup !== null
export const selectFrameCount = (state: AnimationStoreState) =>
  state.frameGroup ? state.frameGroup.frames : 0
export const selectIsAnimation = (state: AnimationStoreState) =>
  state.frameGroup !== null && state.frameGroup.frames > 1
export const selectAnimationMode = (state: AnimationStoreState) =>
  state.frameGroup ? state.frameGroup.animationMode : AnimationModeConst.ASYNCHRONOUS
export const selectLoopCount = (state: AnimationStoreState) =>
  state.frameGroup ? state.frameGroup.loopCount : 0
export const selectStartFrame = (state: AnimationStoreState) =>
  state.frameGroup ? state.frameGroup.startFrame : 0
