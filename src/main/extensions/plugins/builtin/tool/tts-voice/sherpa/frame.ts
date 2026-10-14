/** ACKM length-prefixed frames. Control = UTF-8 JSON. Audio = raw Int16 LE. */

export const FRAME_MAGIC = 0x4d4b4341
export const FRAME_KIND_CONTROL = 1
export const FRAME_KIND_PCM16 = 2
export const FRAME_HEADER_SIZE = 17

export type DecodedFrame = {
  kind: 1 | 2
  sessionId: number
  sequence: number
  payload: Buffer
}

export function encodeFrame(
  kind: 1 | 2,
  sessionId: number,
  sequence: number,
  payload: Buffer
): Buffer {
  const header = Buffer.alloc(FRAME_HEADER_SIZE)
  header.writeUInt32LE(FRAME_MAGIC, 0)
  header.writeUInt8(kind, 4)
  header.writeUInt32LE(sessionId >>> 0, 5)
  header.writeUInt32LE(sequence >>> 0, 9)
  header.writeUInt32LE(payload.length, 13)
  return Buffer.concat([header, payload])
}

export function encodeControl(sessionId: number, sequence: number, obj: unknown): Buffer {
  return encodeFrame(FRAME_KIND_CONTROL, sessionId, sequence, Buffer.from(JSON.stringify(obj), 'utf8'))
}

export function encodePcm16(sessionId: number, sequence: number, pcm: Buffer): Buffer {
  return encodeFrame(FRAME_KIND_PCM16, sessionId, sequence, pcm)
}

export function createFrameParser(onFrame: (frame: DecodedFrame) => void): (chunk: Buffer) => void {
  let buf = Buffer.alloc(0)
  return (chunk: Buffer) => {
    buf = Buffer.concat([buf, chunk])
    while (buf.length >= FRAME_HEADER_SIZE) {
      const magic = buf.readUInt32LE(0)
      if (magic !== FRAME_MAGIC) {
        const next = buf.indexOf(Buffer.from([0x41, 0x43, 0x4b, 0x4d]), 1)
        if (next < 0) {
          buf = Buffer.alloc(0)
          return
        }
        buf = buf.subarray(next)
        continue
      }
      const kind = buf.readUInt8(4)
      const sessionId = buf.readUInt32LE(5)
      const sequence = buf.readUInt32LE(9)
      const payloadLen = buf.readUInt32LE(13)
      if (payloadLen > 8 * 1024 * 1024) {
        buf = buf.subarray(1)
        continue
      }
      const total = FRAME_HEADER_SIZE + payloadLen
      if (buf.length < total) return
      const payload = buf.subarray(FRAME_HEADER_SIZE, total)
      buf = buf.subarray(total)
      if (kind === FRAME_KIND_CONTROL || kind === FRAME_KIND_PCM16) {
        onFrame({ kind, sessionId, sequence, payload: Buffer.from(payload) })
      }
    }
  }
}
