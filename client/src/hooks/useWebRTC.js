import { useEffect, useRef, useState } from 'react'
import Peer from 'peerjs'

/**
 * Creates and manages a PeerJS peer for the lifetime of the component.
 * Pass `id` to claim a specific peer id (host); omit it to let PeerJS
 * assign a random one (viewer).
 */
export default function useWebRTC(id) {
  const [peer, setPeer] = useState(null)
  const [status, setStatus] = useState('connecting') // connecting | ready | disconnected | error
  const [error, setError] = useState(null)
  const peerRef = useRef(null)

  useEffect(() => {
    const instance = id ? new Peer(id) : new Peer()
    peerRef.current = instance

    instance.on('open', () => {
      setStatus('ready')
      setError(null)
    })

    instance.on('disconnected', () => {
      setStatus('disconnected')
    })

    instance.on('close', () => {
      setStatus('disconnected')
    })

    instance.on('error', (err) => {
      if (err.type === 'unavailable-id') {
        setError('That room is already in use. Try again to get a new one.')
      } else if (err.type === 'peer-unavailable') {
        setError("That room doesn't exist, or the host has left.")
      } else if (err.type === 'network' || err.type === 'server-error') {
        setError('Connection to the signaling server failed. Check your internet connection.')
      } else {
        setError('Something went wrong with the connection.')
      }
      setStatus('error')
    })

    setPeer(instance)

    return () => {
      instance.removeAllListeners()
      instance.destroy()
    }
  }, [id])

  return { peer, status, error }
}
