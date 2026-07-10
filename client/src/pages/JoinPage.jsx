import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ScanLine, ArrowRight } from 'lucide-react'
import toast from 'react-hot-toast'
import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning'
import Card from '../components/Card'
import Button from '../components/Button'

// Room codes are 6 chars from an alphabet that excludes 0/O/1/I -- see
// lib/roomId.js. Scanned QR values are full join URLs
// (https://.../join/<code>); pull the code back out either way.
function extractRoomCode(raw) {
  const trimmed = raw.trim()
  const match = trimmed.match(/([A-Z2-9]{6})\/?$/i)
  return match ? match[1].toUpperCase() : trimmed.toUpperCase()
}

export default function JoinPage() {
  const [code, setCode] = useState('')
  const [scanning, setScanning] = useState(false)
  const navigate = useNavigate()

  const goToRoom = (raw) => {
    const roomCode = extractRoomCode(raw)
    if (!roomCode) return
    navigate(`/join/${roomCode}`)
  }

  const submitCode = (e) => {
    e.preventDefault()
    if (!code.trim()) return
    goToRoom(code)
  }

  const scanQr = async () => {
    try {
      const { camera } = await BarcodeScanner.requestPermissions()
      if (camera !== 'granted' && camera !== 'limited') {
        toast.error('Camera permission is needed to scan a QR code')
        return
      }

      setScanning(true)
      const { barcodes } = await BarcodeScanner.scan()
      if (barcodes.length > 0) {
        goToRoom(barcodes[0].rawValue)
      }
    } catch (err) {
      toast.error(err.message || 'Could not open the scanner')
    } finally {
      setScanning(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pb-12 sm:px-8 sm:pb-16">
      <section className="mx-auto max-w-sm pt-6 pb-8 text-center sm:pt-14 sm:pb-10">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-cyan">Join a room</p>
        <h1 className="mt-3 font-display text-2xl font-semibold tracking-tight text-text sm:mt-4 sm:text-3xl">
          Enter a code or scan
        </h1>
      </section>

      <Card className="flex flex-col gap-5 p-5 sm:gap-6 sm:p-8">
        <form onSubmit={submitCode} className="flex flex-col gap-3">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ROOM CODE"
            maxLength={6}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            className="h-14 rounded-xl border border-border bg-surface-2 px-4 text-center font-mono text-2xl tracking-[0.3em] text-text placeholder:text-faint focus:border-violet-light focus:outline-none"
          />
          <Button type="submit" size="lg" disabled={!code.trim()}>
            Join
            <ArrowRight className="h-4 w-4" strokeWidth={2.25} />
          </Button>
        </form>

        <div className="flex items-center gap-3 text-xs text-faint">
          <div className="h-px flex-1 bg-border" />
          or
          <div className="h-px flex-1 bg-border" />
        </div>

        <Button variant="ghost" size="lg" onClick={scanQr} disabled={scanning}>
          <ScanLine className="h-4 w-4" strokeWidth={2.25} />
          {scanning ? 'Scanning…' : 'Scan QR code'}
        </Button>
      </Card>
    </div>
  )
}
