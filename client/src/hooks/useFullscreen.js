import { useEffect, useState, useCallback } from 'react'

/**
 * Wraps the Fullscreen API for a container element, with an iOS Safari
 * fallback: iOS only supports fullscreen on the <video> element itself (not
 * arbitrary containers), so `videoRef` is used there instead — iOS then owns
 * its own native fullscreen/landscape player UI.
 */
export default function useFullscreen(containerRef, videoRef) {
  const [isFullscreen, setIsFullscreen] = useState(false)

  const standardSupported =
    typeof document !== 'undefined' && Boolean(document.fullscreenEnabled)
  const iosVideoSupported =
    typeof videoRef.current?.webkitEnterFullscreen === 'function'
  const supported = standardSupported || iosVideoSupported

  useEffect(() => {
    const onChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement || document.webkitFullscreenElement))
    }
    document.addEventListener('fullscreenchange', onChange)
    document.addEventListener('webkitfullscreenchange', onChange)
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      document.removeEventListener('webkitfullscreenchange', onChange)
    }
  }, [])

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current
    const video = videoRef.current

    if (isFullscreen) {
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
      return
    }

    if (container?.requestFullscreen) {
      container.requestFullscreen().catch(() => {})
    } else if (video?.webkitEnterFullscreen) {
      // iOS Safari: only the <video> element itself supports fullscreen,
      // and it takes over with its own native player UI + landscape.
      video.webkitEnterFullscreen()
    }
  }, [containerRef, videoRef, isFullscreen])

  return { isFullscreen, toggleFullscreen, supported }
}
