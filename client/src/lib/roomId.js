const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O/1/I to avoid confusion

export function generateRoomId(length = 6) {
  let id = ''
  for (let i = 0; i < length; i++) {
    id += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  }
  return id
}

export function roomIdToPeerId(roomId) {
  return `glimpse-${roomId.toLowerCase()}`
}
