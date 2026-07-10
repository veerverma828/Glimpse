import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { App } from '@capacitor/app'

// Android opens https://veerverma828.github.io/Glimpse/join/<roomId> links
// (QR scan, shared link, etc.) directly in this app once installed -- see
// the VIEW intent-filter in AndroidManifest.xml. Capacitor delivers that as
// a plain URL string via appUrlOpen; pull out the path after "/Glimpse" and
// hand it to the router instead of trying to load it as a remote page.
export default function DeepLinkHandler() {
  const navigate = useNavigate()

  useEffect(() => {
    const listenerPromise = App.addListener('appUrlOpen', ({ url }) => {
      try {
        const path = new URL(url).pathname.replace(/^\/Glimpse/, '') || '/'
        navigate(path)
      } catch {
        // malformed/unexpected URL -- ignore, stay on current screen
      }
    })

    return () => {
      listenerPromise.then((listener) => listener.remove())
    }
  }, [navigate])

  return null
}
