import { describe, it, expect, beforeEach } from 'vitest'
import {
  useAnimationStore,
  resetAnimationStore,
  PlaybackDirection,
  FRAME_AUTOMATIC,
  FRAME_RANDOM,
  FRAME_ASYNCHRONOUS,
  selectFrameGroup,
  selectFrameGroupType,
  selectCurrentFrame,
  selectIsPlaying,
  selectPlaybackSpeed,
  selectPlaybackDirection,
  selectCurrentLoop,
  selectIsComplete,
  selectIsAnimationChanged,
  selectCurrentFrameRemaining,
  selectHasFrameGroup,
  selectFrameCount,
  selectIsAnimation,
  selectAnimationMode,
  selectLoopCount,
  selectStartFrame
} from '../use-animation-store'
import {
  type FrameGroup,
  AnimationMode,
  FrameGroupType,
  createFrameGroup,
  createFrameDuration
} from '../../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a frame group with N frames and given properties. */
function makeFrameGroup(frames: number, opts?: Partial<FrameGroup>): FrameGroup {
  const fg = createFrameGroup()
  fg.frames = frames
  fg.isAnimation = frames > 1
  fg.frameDurations = Array.from({ length: frames }, () => createFrameDuration(100, 100))
  fg.spriteIndex = new Array(
    fg.width * fg.height * fg.layers * fg.patternX * fg.patternY * fg.patternZ * frames
  ).fill(0)
  if (opts) Object.assign(fg, opts)
  return fg
}

function state() {
  return useAnimationStore.getState()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetAnimationStore()
})

describe('constants', () => {
  it('has frame constants', () => {
    expect(FRAME_AUTOMATIC).toBe(-1)
    expect(FRAME_RANDOM).toBe(0xfe)
    expect(FRAME_ASYNCHRONOUS).toBe(0xff)
  })

  it('has playback direction constants', () => {
    expect(PlaybackDirection.FORWARD).toBe(0)
    expect(PlaybackDirection.BACKWARD).toBe(1)
  })
})

describe('initial state', () => {
  it('has null frame group', () => {
    expect(state().frameGroup).toBeNull()
  })

  it('has DEFAULT frame group type', () => {
    expect(state().frameGroupType).toBe(FrameGroupType.DEFAULT)
  })

  it('has zero current frame', () => {
    expect(state().currentFrame).toBe(0)
  })

  it('is not playing', () => {
    expect(state().isPlaying).toBe(false)
  })

  it('has default playback speed', () => {
    expect(state().playbackSpeed).toBe(1.0)
  })

  it('has forward playback direction', () => {
    expect(state().playbackDirection).toBe(PlaybackDirection.FORWARD)
  })

  it('has zero current loop', () => {
    expect(state().currentLoop).toBe(0)
  })

  it('is not complete', () => {
    expect(state().isComplete).toBe(false)
  })

  it('has uninitialized last update time', () => {
    expect(state().lastUpdateTime).toBe(-1)
  })

  it('has zero current frame remaining', () => {
    expect(state().currentFrameRemaining).toBe(0)
  })

  it('is not changed', () => {
    expect(state().isChanged).toBe(false)
  })
})

describe('setFrameGroup', () => {
  it('sets the frame group as a clone', () => {
    const fg = makeFrameGroup(3)
    state().setFrameGroup(fg)

    expect(state().frameGroup).not.toBeNull()
    expect(state().frameGroup).not.toBe(fg) // clone
    expect(state().frameGroup!.frames).toBe(3)
  })

  it('resets playback state', () => {
    const fg = makeFrameGroup(3)
    state().setFrameGroup(fg)

    expect(state().currentFrame).toBe(0)
    expect(state().isPlaying).toBe(false)
    expect(state().isComplete).toBe(false)
    expect(state().currentLoop).toBe(0)
    expect(state().playbackDirection).toBe(PlaybackDirection.FORWARD)
  })

  it('clamps invalid frame durations to the default playback duration', () => {
    const fg = makeFrameGroup(2)
    fg.frameDurations = [createFrameDuration(0, 0), createFrameDuration(0, 0)]

    state().setFrameGroup(fg)

    expect(state().currentFrameRemaining).toBe(100)
  })

  it('sets frame group type from parameter', () => {
    const fg = makeFrameGroup(3)
    state().setFrameGroup(fg, FrameGroupType.WALKING)

    expect(state().frameGroupType).toBe(FrameGroupType.WALKING)
  })

  it('defaults type from frame group', () => {
    const fg = makeFrameGroup(3, { type: FrameGroupType.WALKING })
    state().setFrameGroup(fg)

    expect(state().frameGroupType).toBe(FrameGroupType.WALKING)
  })

  it('initializes current frame remaining', () => {
    const fg = makeFrameGroup(3)
    fg.frameDurations![0] = createFrameDuration(200, 200)
    state().setFrameGroup(fg)

    expect(state().currentFrameRemaining).toBe(200)
  })

  it('resets isChanged', () => {
    const fg = makeFrameGroup(3)
    state().setFrameGroup(fg)
    state().setAnimationMode(AnimationMode.SYNCHRONOUS)
    expect(state().isChanged).toBe(true)

    state().setFrameGroup(fg)
    expect(state().isChanged).toBe(false)
  })
})

describe('clearFrameGroup', () => {
  it('resets all state', () => {
    const fg = makeFrameGroup(3)
    state().setFrameGroup(fg)
    state().play()
    state().setAnimationMode(AnimationMode.SYNCHRONOUS)

    state().clearFrameGroup()

    expect(state().frameGroup).toBeNull()
    expect(state().frameGroupType).toBe(FrameGroupType.DEFAULT)
    expect(state().currentFrame).toBe(0)
    expect(state().isPlaying).toBe(false)
    expect(state().isChanged).toBe(false)
  })
})

describe('setFrameGroupType', () => {
  it('changes the type', () => {
    state().setFrameGroupType(FrameGroupType.WALKING)
    expect(state().frameGroupType).toBe(FrameGroupType.WALKING)
  })
})

describe('play', () => {
  it('starts playback for multi-frame groups', () => {
    const fg = makeFrameGroup(3)
    state().setFrameGroup(fg)
    state().play()

    expect(state().isPlaying).toBe(true)
  })

  it('does nothing for single-frame groups', () => {
    const fg = makeFrameGroup(1)
    state().setFrameGroup(fg)
    state().play()

    expect(state().isPlaying).toBe(false)
  })

  it('does nothing without a frame group', () => {
    state().play()
    expect(state().isPlaying).toBe(false)
  })

  it('restarts if animation was complete', () => {
    const fg = makeFrameGroup(3, { loopCount: 1 })
    state().setFrameGroup(fg)

    // Simulate completion
    useAnimationStore.setState({ isComplete: true, currentFrame: 2, isPlaying: false })

    state().play()
    expect(state().isPlaying).toBe(true)
    expect(state().isComplete).toBe(false)
    expect(state().currentFrame).toBe(0)
    expect(state().currentLoop).toBe(0)
  })
})

describe('pause', () => {
  it('stops playback', () => {
    const fg = makeFrameGroup(3)
    state().setFrameGroup(fg)
    state().play()
    expect(state().isPlaying).toBe(true)

    state().pause()
    expect(state().isPlaying).toBe(false)
  })
})

describe('stop', () => {
  it('stops playback and resets to frame 0', () => {
    const fg = makeFrameGroup(3)
    state().setFrameGroup(fg)
    state().play()
    state().setCurrentFrame(2)

    state().stop()

    expect(state().isPlaying).toBe(false)
    expect(state().currentFrame).toBe(0)
    expect(state().currentLoop).toBe(0)
    expect(state().isComplete).toBe(false)
  })
})

describe('togglePlayback', () => {
  it('starts playback when paused', () => {
    const fg = makeFrameGroup(3)
    state().setFrameGroup(fg)

    state().togglePlayback()
    expect(state().isPlaying).toBe(true)
  })

  it('pauses playback when playing', () => {
    const fg = makeFrameGroup(3)
    state().setFrameGroup(fg)
    state().play()

    state().togglePlayback()
    expect(state().isPlaying).toBe(false)
  })
})

describe('setPlaybackSpeed', () => {
  it('sets speed', () => {
    state().setPlaybackSpeed(2.0)
    expect(state().playbackSpeed).toBe(2.0)
  })

  it('clamps to minimum 0.1', () => {
    state().setPlaybackSpeed(0)
    expect(state().playbackSpeed).toBe(0.1)
  })

  it('clamps to maximum 10.0', () => {
    state().setPlaybackSpeed(20)
    expect(state().playbackSpeed).toBe(10.0)
  })
})

describe('frame navigation', () => {
  describe('setCurrentFrame', () => {
    it('sets frame within bounds', () => {
      const fg = makeFrameGroup(5)
      state().setFrameGroup(fg)
      state().setCurrentFrame(3)

      expect(state().currentFrame).toBe(3)
    })

    it('clamps to max frame', () => {
      const fg = makeFrameGroup(3)
      state().setFrameGroup(fg)
      state().setCurrentFrame(10)

      expect(state().currentFrame).toBe(2) // frames-1
    })

    it('clamps to 0', () => {
      const fg = makeFrameGroup(3)
      state().setFrameGroup(fg)
      state().setCurrentFrame(-5)

      expect(state().currentFrame).toBe(0)
    })

    it('does nothing without frame group', () => {
      state().setCurrentFrame(3)
      expect(state().currentFrame).toBe(0)
    })

    it('updates current frame remaining', () => {
      const fg = makeFrameGroup(3)
      fg.frameDurations![2] = createFrameDuration(300, 300)
      state().setFrameGroup(fg)
      state().setCurrentFrame(2)

      expect(state().currentFrameRemaining).toBe(300)
    })
  })

  describe('nextFrame', () => {
    it('advances to next frame', () => {
      const fg = makeFrameGroup(3)
      state().setFrameGroup(fg)
      state().nextFrame()

      expect(state().currentFrame).toBe(1)
    })

    it('wraps to 0 from last frame', () => {
      const fg = makeFrameGroup(3)
      state().setFrameGroup(fg)
      state().setCurrentFrame(2)
      state().nextFrame()

      expect(state().currentFrame).toBe(0)
    })

    it('does nothing without frame group', () => {
      state().nextFrame()
      expect(state().currentFrame).toBe(0)
    })
  })

  describe('prevFrame', () => {
    it('goes to previous frame', () => {
      const fg = makeFrameGroup(3)
      state().setFrameGroup(fg)
      state().setCurrentFrame(2)
      state().prevFrame()

      expect(state().currentFrame).toBe(1)
    })

    it('wraps to last frame from 0', () => {
      const fg = makeFrameGroup(3)
      state().setFrameGroup(fg)
      state().prevFrame()

      expect(state().currentFrame).toBe(2)
    })
  })

  describe('firstFrame', () => {
    it('goes to frame 0', () => {
      const fg = makeFrameGroup(5)
      state().setFrameGroup(fg)
      state().setCurrentFrame(4)
      state().firstFrame()

      expect(state().currentFrame).toBe(0)
    })
  })

  describe('lastFrame', () => {
    it('goes to last frame', () => {
      const fg = makeFrameGroup(5)
      state().setFrameGroup(fg)
      state().lastFrame()

      expect(state().currentFrame).toBe(4)
    })
  })
})

describe('update (animation tick)', () => {
  it('does nothing when not playing', () => {
    const fg = makeFrameGroup(3)
    state().setFrameGroup(fg)
    state().update(1000)

    expect(state().currentFrame).toBe(0)
  })

  it('initializes lastUpdateTime on first call', () => {
    const fg = makeFrameGroup(3)
    state().setFrameGroup(fg)
    state().play()
    state().update(1000)

    expect(state().lastUpdateTime).toBe(1000)
    expect(state().currentFrame).toBe(0) // no advance on first call
  })

  it('advances frame when elapsed exceeds duration', () => {
    const fg = makeFrameGroup(3)
    fg.frameDurations = [
      createFrameDuration(100, 100),
      createFrameDuration(100, 100),
      createFrameDuration(100, 100)
    ]
    state().setFrameGroup(fg)
    state().play()

    state().update(1000) // init
    state().update(1150) // 150ms elapsed, frame 0 duration is 100ms -> advance

    expect(state().currentFrame).toBe(1)
  })

  it('does not advance when elapsed is less than duration', () => {
    const fg = makeFrameGroup(3)
    fg.frameDurations = [
      createFrameDuration(200, 200),
      createFrameDuration(200, 200),
      createFrameDuration(200, 200)
    ]
    state().setFrameGroup(fg)
    state().play()

    state().update(1000) // init
    state().update(1050) // only 50ms elapsed

    expect(state().currentFrame).toBe(0)
  })

  it('loops infinitely when loopCount is 0', () => {
    const fg = makeFrameGroup(2, { loopCount: 0 })
    fg.frameDurations = [createFrameDuration(100, 100), createFrameDuration(100, 100)]
    state().setFrameGroup(fg)
    state().play()

    state().update(1000) // init
    state().update(1100) // exactly 100ms -> frame 0 -> 1
    expect(state().currentFrame).toBe(1)

    state().update(1200) // exactly 100ms -> frame 1 -> 0 (wrap)
    expect(state().currentFrame).toBe(0)
    expect(state().isComplete).toBe(false)
    expect(state().isPlaying).toBe(true)
  })

  it('completes after N loops when loopCount > 0', () => {
    const fg = makeFrameGroup(2, { loopCount: 1 })
    fg.frameDurations = [createFrameDuration(100, 100), createFrameDuration(100, 100)]
    state().setFrameGroup(fg)
    state().play()

    state().update(1000) // init
    state().update(1150) // frame 0 -> 1
    expect(state().currentFrame).toBe(1)

    state().update(1300) // frame 1 -> wrap -> complete
    expect(state().isComplete).toBe(true)
    expect(state().isPlaying).toBe(false)
    expect(state().currentFrame).toBe(1) // stays on last frame
  })

  it('handles ping-pong mode (loopCount < 0)', () => {
    const fg = makeFrameGroup(3, { loopCount: -1 })
    fg.frameDurations = [
      createFrameDuration(50, 50),
      createFrameDuration(50, 50),
      createFrameDuration(50, 50)
    ]
    state().setFrameGroup(fg)
    state().play()

    state().update(1000) // init
    state().update(1060) // frame 0 -> 1 (forward)
    expect(state().currentFrame).toBe(1)
    expect(state().playbackDirection).toBe(PlaybackDirection.FORWARD)

    state().update(1120) // frame 1 -> 2 (forward, hit end)
    expect(state().currentFrame).toBe(2)

    state().update(1180) // frame 2 -> direction reverses -> frame 1
    expect(state().playbackDirection).toBe(PlaybackDirection.BACKWARD)
    expect(state().currentFrame).toBe(1)
  })

  it('respects playback speed', () => {
    const fg = makeFrameGroup(3)
    fg.frameDurations = [
      createFrameDuration(100, 100),
      createFrameDuration(100, 100),
      createFrameDuration(100, 100)
    ]
    state().setFrameGroup(fg)
    state().play()
    state().setPlaybackSpeed(2.0) // 2x speed

    state().update(1000) // init
    state().update(1060) // 60ms real time * 2x = 120ms effective -> advance frame

    expect(state().currentFrame).toBe(1)
  })

  it('does nothing when complete', () => {
    const fg = makeFrameGroup(3)
    state().setFrameGroup(fg)
    useAnimationStore.setState({ isPlaying: true, isComplete: true })

    state().update(1000)
    expect(state().currentFrame).toBe(0)
  })
})

describe('resetPlayback', () => {
  it('resets playback state', () => {
    const fg = makeFrameGroup(3)
    state().setFrameGroup(fg)
    state().play()
    state().setCurrentFrame(2)

    state().resetPlayback()

    expect(state().currentFrame).toBe(0)
    expect(state().isPlaying).toBe(false)
    expect(state().currentLoop).toBe(0)
    expect(state().isComplete).toBe(false)
    expect(state().playbackDirection).toBe(PlaybackDirection.FORWARD)
  })
})

describe('frame duration editing', () => {
  describe('setFrameDuration', () => {
    it('updates duration for a specific frame', () => {
      const fg = makeFrameGroup(3)
      state().setFrameGroup(fg)

      state().setFrameDuration(1, createFrameDuration(200, 300))

      const fd = state().frameGroup!.frameDurations![1]
      expect(fd.minimum).toBe(200)
      expect(fd.maximum).toBe(300)
    })

    it('marks as changed', () => {
      const fg = makeFrameGroup(3)
      state().setFrameGroup(fg)

      state().setFrameDuration(0, createFrameDuration(200, 200))
      expect(state().isChanged).toBe(true)
    })

    it('clones the duration', () => {
      const fg = makeFrameGroup(3)
      state().setFrameGroup(fg)

      const d = createFrameDuration(200, 300)
      state().setFrameDuration(1, d)

      expect(state().frameGroup!.frameDurations![1]).not.toBe(d)
    })

    it('does nothing for out-of-bounds index', () => {
      const fg = makeFrameGroup(3)
      state().setFrameGroup(fg)

      state().setFrameDuration(10, createFrameDuration(200, 200))
      expect(state().isChanged).toBe(false)
    })

    it('does nothing without frame group', () => {
      state().setFrameDuration(0, createFrameDuration(200, 200))
      expect(state().isChanged).toBe(false)
    })
  })

  describe('setAllFrameDurations', () => {
    it('sets all frames to the same duration', () => {
      const fg = makeFrameGroup(3)
      state().setFrameGroup(fg)

      state().setAllFrameDurations(createFrameDuration(500, 500))

      const fds = state().frameGroup!.frameDurations!
      expect(fds[0].minimum).toBe(500)
      expect(fds[1].minimum).toBe(500)
      expect(fds[2].minimum).toBe(500)
    })

    it('marks as changed', () => {
      const fg = makeFrameGroup(3)
      state().setFrameGroup(fg)

      state().setAllFrameDurations(createFrameDuration(500, 500))
      expect(state().isChanged).toBe(true)
    })
  })
})

describe('frame management', () => {
  describe('addFrame', () => {
    it('adds a frame with default duration', () => {
      const fg = makeFrameGroup(2)
      state().setFrameGroup(fg)

      state().addFrame()

      expect(state().frameGroup!.frames).toBe(3)
      expect(state().frameGroup!.frameDurations!.length).toBe(3)
    })

    it('adds a frame with custom duration', () => {
      const fg = makeFrameGroup(2)
      state().setFrameGroup(fg)

      state().addFrame(createFrameDuration(250, 350))

      const fd = state().frameGroup!.frameDurations![2]
      expect(fd.minimum).toBe(250)
      expect(fd.maximum).toBe(350)
    })

    it('adds sprite slots', () => {
      const fg = makeFrameGroup(2) // width=1, height=1, layers=1, patternX/Y/Z=1
      state().setFrameGroup(fg)
      const beforeCount = state().frameGroup!.spriteIndex.length

      state().addFrame()

      expect(state().frameGroup!.spriteIndex.length).toBe(beforeCount + 1) // 1 slot per frame for 1x1x1x1x1x1
    })

    it('adds sprite slots for complex frame group', () => {
      const fg = makeFrameGroup(1, { width: 2, height: 2, layers: 1, patternX: 4 })
      // spriteIndex should be 2*2*1*4*1*1*1 = 16
      fg.spriteIndex = new Array(16).fill(0)
      state().setFrameGroup(fg)

      state().addFrame()

      // Now 2 frames: 2*2*1*4*1*1*2 = 32
      expect(state().frameGroup!.spriteIndex.length).toBe(32)
    })

    it('marks as animation when adding second frame', () => {
      const fg = makeFrameGroup(1)
      fg.isAnimation = false
      state().setFrameGroup(fg)

      state().addFrame()

      expect(state().frameGroup!.isAnimation).toBe(true)
    })

    it('creates frameDurations array if null', () => {
      const fg = makeFrameGroup(1)
      fg.frameDurations = null
      state().setFrameGroup(fg)

      state().addFrame()

      expect(state().frameGroup!.frameDurations).not.toBeNull()
      expect(state().frameGroup!.frameDurations!.length).toBe(1)
    })

    it('marks as changed', () => {
      const fg = makeFrameGroup(2)
      state().setFrameGroup(fg)

      state().addFrame()
      expect(state().isChanged).toBe(true)
    })

    it('does nothing without frame group', () => {
      state().addFrame()
      expect(state().frameGroup).toBeNull()
    })
  })

  describe('removeFrame', () => {
    it('removes a frame', () => {
      const fg = makeFrameGroup(3)
      state().setFrameGroup(fg)

      state().removeFrame(1)

      expect(state().frameGroup!.frames).toBe(2)
      expect(state().frameGroup!.frameDurations!.length).toBe(2)
    })

    it('removes corresponding sprite slots', () => {
      const fg = makeFrameGroup(3) // 3 sprites (1 per frame)
      state().setFrameGroup(fg)

      state().removeFrame(1)

      expect(state().frameGroup!.spriteIndex.length).toBe(2)
    })

    it('does not remove when only 1 frame', () => {
      const fg = makeFrameGroup(1)
      state().setFrameGroup(fg)

      state().removeFrame(0)

      expect(state().frameGroup!.frames).toBe(1)
    })

    it('clamps current frame if it exceeds new count', () => {
      const fg = makeFrameGroup(3)
      state().setFrameGroup(fg)
      state().setCurrentFrame(2)

      state().removeFrame(2)

      expect(state().currentFrame).toBe(1) // clamped to frames-1
    })

    it('sets isAnimation to false when going to 1 frame', () => {
      const fg = makeFrameGroup(2)
      state().setFrameGroup(fg)

      state().removeFrame(1)

      expect(state().frameGroup!.isAnimation).toBe(false)
    })

    it('does nothing for out-of-bounds index', () => {
      const fg = makeFrameGroup(3)
      state().setFrameGroup(fg)

      state().removeFrame(10)

      expect(state().frameGroup!.frames).toBe(3)
    })

    it('marks as changed', () => {
      const fg = makeFrameGroup(3)
      state().setFrameGroup(fg)

      state().removeFrame(1)
      expect(state().isChanged).toBe(true)
    })
  })

  describe('duplicateFrame', () => {
    it('duplicates a frame', () => {
      const fg = makeFrameGroup(2)
      fg.frameDurations = [createFrameDuration(100, 100), createFrameDuration(200, 200)]
      state().setFrameGroup(fg)

      state().duplicateFrame(0)

      expect(state().frameGroup!.frames).toBe(3)
      expect(state().frameGroup!.frameDurations![1].minimum).toBe(100) // copied from frame 0
    })

    it('copies sprite slots', () => {
      const fg = makeFrameGroup(2)
      fg.spriteIndex = [10, 20]
      state().setFrameGroup(fg)

      state().duplicateFrame(0)

      expect(state().frameGroup!.spriteIndex).toEqual([10, 10, 20])
    })

    it('does nothing for out-of-bounds index', () => {
      const fg = makeFrameGroup(2)
      state().setFrameGroup(fg)

      state().duplicateFrame(5)

      expect(state().frameGroup!.frames).toBe(2)
    })

    it('marks as changed', () => {
      const fg = makeFrameGroup(2)
      state().setFrameGroup(fg)

      state().duplicateFrame(0)
      expect(state().isChanged).toBe(true)
    })
  })
})

describe('animation configuration', () => {
  describe('setAnimationMode', () => {
    it('changes animation mode', () => {
      const fg = makeFrameGroup(3)
      state().setFrameGroup(fg)

      state().setAnimationMode(AnimationMode.SYNCHRONOUS)

      expect(state().frameGroup!.animationMode).toBe(AnimationMode.SYNCHRONOUS)
    })

    it('marks as changed', () => {
      const fg = makeFrameGroup(3)
      state().setFrameGroup(fg)

      state().setAnimationMode(AnimationMode.SYNCHRONOUS)
      expect(state().isChanged).toBe(true)
    })

    it('does nothing without frame group', () => {
      state().setAnimationMode(AnimationMode.SYNCHRONOUS)
      expect(state().isChanged).toBe(false)
    })
  })

  describe('setLoopCount', () => {
    it('sets loop count', () => {
      const fg = makeFrameGroup(3)
      state().setFrameGroup(fg)

      state().setLoopCount(5)

      expect(state().frameGroup!.loopCount).toBe(5)
    })

    it('supports negative for ping-pong', () => {
      const fg = makeFrameGroup(3)
      state().setFrameGroup(fg)

      state().setLoopCount(-1)

      expect(state().frameGroup!.loopCount).toBe(-1)
    })

    it('marks as changed', () => {
      const fg = makeFrameGroup(3)
      state().setFrameGroup(fg)

      state().setLoopCount(3)
      expect(state().isChanged).toBe(true)
    })
  })

  describe('setStartFrame', () => {
    it('sets start frame', () => {
      const fg = makeFrameGroup(3)
      state().setFrameGroup(fg)

      state().setStartFrame(2)

      expect(state().frameGroup!.startFrame).toBe(2)
    })

    it('supports FRAME_AUTOMATIC (-1)', () => {
      const fg = makeFrameGroup(3)
      state().setFrameGroup(fg)

      state().setStartFrame(FRAME_AUTOMATIC)

      expect(state().frameGroup!.startFrame).toBe(-1)
    })

    it('marks as changed', () => {
      const fg = makeFrameGroup(3)
      state().setFrameGroup(fg)

      state().setStartFrame(1)
      expect(state().isChanged).toBe(true)
    })
  })
})

describe('getters', () => {
  describe('getFrameCount', () => {
    it('returns 0 without frame group', () => {
      expect(state().getFrameCount()).toBe(0)
    })

    it('returns frame count', () => {
      const fg = makeFrameGroup(5)
      state().setFrameGroup(fg)
      expect(state().getFrameCount()).toBe(5)
    })
  })

  describe('getFrameDuration', () => {
    it('returns null without frame group', () => {
      expect(state().getFrameDuration(0)).toBeNull()
    })

    it('returns duration for valid index', () => {
      const fg = makeFrameGroup(3)
      fg.frameDurations![1] = createFrameDuration(200, 300)
      state().setFrameGroup(fg)

      const fd = state().getFrameDuration(1)
      expect(fd).not.toBeNull()
      expect(fd!.minimum).toBe(200)
      expect(fd!.maximum).toBe(300)
    })

    it('returns null for out-of-bounds index', () => {
      const fg = makeFrameGroup(3)
      state().setFrameGroup(fg)
      expect(state().getFrameDuration(10)).toBeNull()
    })
  })

  describe('getCurrentFrameDuration', () => {
    it('returns null without frame group', () => {
      expect(state().getCurrentFrameDuration()).toBeNull()
    })

    it('returns duration of current frame', () => {
      const fg = makeFrameGroup(3)
      fg.frameDurations![2] = createFrameDuration(500, 500)
      state().setFrameGroup(fg)
      state().setCurrentFrame(2)

      const fd = state().getCurrentFrameDuration()
      expect(fd).not.toBeNull()
      expect(fd!.minimum).toBe(500)
    })
  })
})

describe('reset', () => {
  it('restores all defaults', () => {
    const fg = makeFrameGroup(3)
    state().setFrameGroup(fg)
    state().play()
    state().setPlaybackSpeed(3.0)
    state().setAnimationMode(AnimationMode.SYNCHRONOUS)

    resetAnimationStore()

    expect(state().frameGroup).toBeNull()
    expect(state().frameGroupType).toBe(FrameGroupType.DEFAULT)
    expect(state().currentFrame).toBe(0)
    expect(state().isPlaying).toBe(false)
    expect(state().playbackSpeed).toBe(1.0)
    expect(state().playbackDirection).toBe(PlaybackDirection.FORWARD)
    expect(state().currentLoop).toBe(0)
    expect(state().isComplete).toBe(false)
    expect(state().lastUpdateTime).toBe(-1)
    expect(state().currentFrameRemaining).toBe(0)
    expect(state().isChanged).toBe(false)
  })
})

describe('selectors', () => {
  it('selectFrameGroup extracts frameGroup', () => {
    const fg = makeFrameGroup(3)
    state().setFrameGroup(fg)
    expect(selectFrameGroup(state())).not.toBeNull()
  })

  it('selectFrameGroupType extracts frameGroupType', () => {
    state().setFrameGroupType(FrameGroupType.WALKING)
    expect(selectFrameGroupType(state())).toBe(FrameGroupType.WALKING)
  })

  it('selectCurrentFrame extracts currentFrame', () => {
    const fg = makeFrameGroup(3)
    state().setFrameGroup(fg)
    state().setCurrentFrame(2)
    expect(selectCurrentFrame(state())).toBe(2)
  })

  it('selectIsPlaying extracts isPlaying', () => {
    const fg = makeFrameGroup(3)
    state().setFrameGroup(fg)
    state().play()
    expect(selectIsPlaying(state())).toBe(true)
  })

  it('selectPlaybackSpeed extracts playbackSpeed', () => {
    state().setPlaybackSpeed(2.5)
    expect(selectPlaybackSpeed(state())).toBe(2.5)
  })

  it('selectPlaybackDirection extracts playbackDirection', () => {
    expect(selectPlaybackDirection(state())).toBe(PlaybackDirection.FORWARD)
  })

  it('selectCurrentLoop extracts currentLoop', () => {
    expect(selectCurrentLoop(state())).toBe(0)
  })

  it('selectIsComplete extracts isComplete', () => {
    expect(selectIsComplete(state())).toBe(false)
  })

  it('selectIsAnimationChanged extracts isChanged', () => {
    expect(selectIsAnimationChanged(state())).toBe(false)
  })

  it('selectCurrentFrameRemaining extracts currentFrameRemaining', () => {
    expect(selectCurrentFrameRemaining(state())).toBe(0)
  })

  it('selectHasFrameGroup returns true when frame group is set', () => {
    expect(selectHasFrameGroup(state())).toBe(false)
    const fg = makeFrameGroup(3)
    state().setFrameGroup(fg)
    expect(selectHasFrameGroup(state())).toBe(true)
  })

  it('selectFrameCount returns frame count', () => {
    expect(selectFrameCount(state())).toBe(0)
    const fg = makeFrameGroup(5)
    state().setFrameGroup(fg)
    expect(selectFrameCount(state())).toBe(5)
  })

  it('selectIsAnimation returns true for multi-frame groups', () => {
    expect(selectIsAnimation(state())).toBe(false)
    const fg = makeFrameGroup(1)
    state().setFrameGroup(fg)
    expect(selectIsAnimation(state())).toBe(false)
    const fg3 = makeFrameGroup(3)
    state().setFrameGroup(fg3)
    expect(selectIsAnimation(state())).toBe(true)
  })

  it('selectAnimationMode returns mode', () => {
    expect(selectAnimationMode(state())).toBe(AnimationMode.ASYNCHRONOUS)
    const fg = makeFrameGroup(3, { animationMode: AnimationMode.SYNCHRONOUS })
    state().setFrameGroup(fg)
    expect(selectAnimationMode(state())).toBe(AnimationMode.SYNCHRONOUS)
  })

  it('selectLoopCount returns loopCount', () => {
    expect(selectLoopCount(state())).toBe(0)
    const fg = makeFrameGroup(3, { loopCount: 5 })
    state().setFrameGroup(fg)
    expect(selectLoopCount(state())).toBe(5)
  })

  it('selectStartFrame returns startFrame', () => {
    expect(selectStartFrame(state())).toBe(0)
    const fg = makeFrameGroup(3, { startFrame: 2 })
    state().setFrameGroup(fg)
    expect(selectStartFrame(state())).toBe(2)
  })
})

describe('integration', () => {
  it('full animation workflow: load, play, advance, stop', () => {
    const fg = makeFrameGroup(3, { loopCount: 0 })
    fg.frameDurations = [
      createFrameDuration(100, 100),
      createFrameDuration(100, 100),
      createFrameDuration(100, 100)
    ]

    // Load
    state().setFrameGroup(fg)
    expect(state().currentFrame).toBe(0)

    // Play
    state().play()
    expect(state().isPlaying).toBe(true)

    // Advance through frames
    state().update(1000) // init
    state().update(1100) // exactly 100ms -> advance to frame 1
    expect(state().currentFrame).toBe(1)

    state().update(1200) // exactly 100ms -> advance to frame 2
    expect(state().currentFrame).toBe(2)

    // Stop
    state().stop()
    expect(state().currentFrame).toBe(0)
    expect(state().isPlaying).toBe(false)
  })

  it('edit durations, then play with new timing', () => {
    const fg = makeFrameGroup(2, { loopCount: 0 })
    state().setFrameGroup(fg)

    // Change duration of frame 0 to 200ms (also updates currentFrameRemaining)
    state().setFrameDuration(0, createFrameDuration(200, 200))
    expect(state().isChanged).toBe(true)
    expect(state().currentFrameRemaining).toBe(200)

    // Play and verify timing
    state().play()
    state().update(1000) // init
    state().update(1150) // 150ms elapsed, frame 0 is now 200ms -> should NOT advance
    expect(state().currentFrame).toBe(0)

    state().update(1250) // 250ms elapsed total -> should advance
    expect(state().currentFrame).toBe(1)
  })

  it('frame navigation while paused', () => {
    const fg = makeFrameGroup(5)
    state().setFrameGroup(fg)

    state().nextFrame()
    expect(state().currentFrame).toBe(1)

    state().nextFrame()
    expect(state().currentFrame).toBe(2)

    state().prevFrame()
    expect(state().currentFrame).toBe(1)

    state().lastFrame()
    expect(state().currentFrame).toBe(4)

    state().firstFrame()
    expect(state().currentFrame).toBe(0)
  })

  it('add and remove frames affects animation', () => {
    const fg = makeFrameGroup(2)
    state().setFrameGroup(fg)

    // Add frame
    state().addFrame(createFrameDuration(300, 300))
    expect(state().frameGroup!.frames).toBe(3)

    // Duplicate frame 0
    state().duplicateFrame(0)
    expect(state().frameGroup!.frames).toBe(4)

    // Remove frame 2
    state().removeFrame(2)
    expect(state().frameGroup!.frames).toBe(3)
  })

  it('configuration changes do not affect playback state', () => {
    const fg = makeFrameGroup(3)
    state().setFrameGroup(fg)
    state().play()
    state().setCurrentFrame(1)

    state().setAnimationMode(AnimationMode.SYNCHRONOUS)
    state().setLoopCount(5)
    state().setStartFrame(1)

    // Playback state unchanged
    expect(state().isPlaying).toBe(true)
    expect(state().currentFrame).toBe(1)
  })
})
