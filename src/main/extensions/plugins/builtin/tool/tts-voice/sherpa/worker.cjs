'use strict'

/**
 * Isolated sherpa-onnx worker. Electron never loads this native addon.
 * stdin/stdout = ACKM frames. kind=1 JSON control, kind=2 raw Int16 LE PCM.
 */

const FRAME_MAGIC = 0x4d4b4341
const KIND_CONTROL = 1
const KIND_PCM = 2
const HEADER = 17

function encodeFrame(kind, sessionId, sequence, payload) {
  const header = Buffer.alloc(HEADER)
  header.writeUInt32LE(FRAME_MAGIC, 0)
  header.writeUInt8(kind, 4)
  header.writeUInt32LE(sessionId >>> 0, 5)
  header.writeUInt32LE(sequence >>> 0, 9)
  header.writeUInt32LE(payload.length, 13)
  return Buffer.concat([header, payload])
}

function send(obj, sessionId, sequence) {
  const payload = Buffer.from(JSON.stringify(obj), 'utf8')
  const ok = process.stdout.write(encodeFrame(KIND_CONTROL, sessionId >>> 0, sequence >>> 0, payload))
  if (!ok) process.stdout.once('drain', () => undefined)
}

function createParser(onFrame) {
  let buf = Buffer.alloc(0)
  return (chunk) => {
    buf = Buffer.concat([buf, chunk])
    while (buf.length >= HEADER) {
      if (buf.readUInt32LE(0) !== FRAME_MAGIC) {
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
      const total = HEADER + payloadLen
      if (buf.length < total) return
      const payload = buf.subarray(HEADER, total)
      buf = buf.subarray(total)
      onFrame({ kind, sessionId, sequence, payload })
    }
  }
}

class EndpointingClock {
  constructor(policy) {
    this.policy = policy
    this.reset()
  }
  reset() {
    this.speechMs = 0
    this.silenceMs = 0
    this.utteranceMs = 0
    this.inUtterance = false
  }
  push(isSpeech, chunkMs) {
    if (chunkMs <= 0) return 'none'
    if (isSpeech) {
      this.speechMs += chunkMs
      this.silenceMs = 0
      if (!this.inUtterance && this.speechMs >= this.policy.minSpeechDurationMs) {
        this.inUtterance = true
        this.utteranceMs = this.speechMs
      } else if (this.inUtterance) {
        this.utteranceMs += chunkMs
      }
      if (this.inUtterance && this.utteranceMs >= this.policy.maxUtteranceDurationMs) {
        this.reset()
        return 'final'
      }
      return 'none'
    }
    if (!this.inUtterance) {
      this.speechMs = 0
      this.silenceMs = 0
      return 'none'
    }
    this.silenceMs += chunkMs
    this.utteranceMs += chunkMs
    if (
      this.silenceMs >= this.policy.minSilenceDurationMs ||
      this.utteranceMs >= this.policy.maxUtteranceDurationMs
    ) {
      this.reset()
      return 'final'
    }
    return 'none'
  }
}

function walk(dir, acc = []) {
  const fs = require('fs')
  const path = require('path')
  if (!fs.existsSync(dir)) return acc
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    if (fs.statSync(p).isDirectory()) walk(p, acc)
    else acc.push(p)
  }
  return acc
}

function findFile(files, re) {
  const matches = files.filter((f) => re.test(f))
  const full = matches.find((f) => !/int8/i.test(f))
  return full || matches[0]
}

function loadSherpa() {
  const paths = []
  if (process.env.NODE_PATH) paths.push(process.env.NODE_PATH)
  for (const dir of paths) {
    module.paths.unshift(dir)
  }
  try {
    return require('sherpa-onnx-node')
  } catch {
    return require('sherpa-onnx')
  }
}

function createRealEngine(init) {
  const path = require('path')
  const sherpa = loadSherpa()
  const asrDir = path.join(init.modelsDir, init.modelId)
  const vadDir = path.join(init.modelsDir, 'vad-silero')
  const asrFiles = walk(asrDir)
  const vadFiles = walk(vadDir)
  const encoder = findFile(asrFiles, /encoder.*\.onnx$/i)
  const decoder = findFile(asrFiles, /decoder.*\.onnx$/i)
  const joiner = findFile(asrFiles, /joiner.*\.onnx$/i)
  const tokens = findFile(asrFiles, /tokens\.txt$/i)
  const vadModel = findFile(vadFiles, /silero_vad\.onnx$/i)
  if (!encoder || !decoder || !joiner || !tokens || !vadModel) {
    throw new Error('模型文件不完整（encoder/decoder/joiner/tokens/vad）')
  }

  const recognizer = new sherpa.OnlineRecognizer({
    featConfig: { sampleRate: 16000, featureDim: 80 },
    modelConfig: {
      transducer: { encoder, decoder, joiner },
      tokens,
      numThreads: 2,
      provider: 'cpu'
    },
    decodingMethod: 'modified_beam_search',
    maxActivePaths: 4,
    enableEndpoint: false
  })
  const vad = new sherpa.Vad(
    {
      sileroVad: {
        model: vadModel,
        threshold: 0.35,
        minSpeechDuration: 0.1,
        minSilenceDuration: 0.3,
        windowSize: 512
      },
      sampleRate: 16000,
      numThreads: 1,
      debug: false
    },
    60
  )
  let stream = recognizer.createStream()
  let pending = new Float32Array(0)
  let feeding = false
  let preroll = []
  const PREROLL_WINDOWS = 12

  function concatFloat(a, b) {
    const out = new Float32Array(a.length + b.length)
    out.set(a, 0)
    out.set(b, a.length)
    return out
  }

  function decodeText() {
    while (recognizer.isReady(stream)) recognizer.decode(stream)
    const result = recognizer.getResult(stream)
    return String(result && result.text ? result.text : '').trim()
  }

  return {
    pushPcm16(int16) {
      const f32 = new Float32Array(int16.length)
      for (let i = 0; i < int16.length; i++) f32[i] = int16[i] / 32768
      pending = concatFloat(pending, f32)
      const window = 512
      let speech = false
      while (pending.length >= window) {
        const slice = pending.subarray(0, window)
        pending = pending.subarray(window)
        vad.acceptWaveform(slice)
        const detected = typeof vad.isDetected === 'function' && vad.isDetected()
        if (detected) {
          speech = true
          if (!feeding) {
            feeding = true
            for (const prev of preroll) {
              stream.acceptWaveform({ samples: prev, sampleRate: 16000 })
            }
            preroll = []
          }
        }
        if (feeding) {
          stream.acceptWaveform({ samples: slice, sampleRate: 16000 })
        } else {
          preroll.push(new Float32Array(slice))
          if (preroll.length > PREROLL_WINDOWS) preroll.shift()
        }
      }
      const text = decodeText()
      return { text, speech }
    },
    reset() {
      try {
        if (typeof recognizer.reset === 'function') recognizer.reset(stream)
      } catch {
        // ignore
      }
      try {
        if (typeof vad.reset === 'function') vad.reset()
      } catch {
        // ignore
      }
      stream = recognizer.createStream()
      pending = new Float32Array(0)
      feeding = false
      preroll = []
    }
  }
}

function createFakeEngine() {
  let samples = 0
  let lastEnergy = 0
  return {
    pushPcm16(int16) {
      samples += int16.length
      let sum = 0
      for (let i = 0; i < int16.length; i++) sum += int16[i] * int16[i]
      lastEnergy = Math.sqrt(sum / Math.max(1, int16.length)) / 32768
      const speech = lastEnergy >= 0.012
      const steps = Math.min(4, Math.floor(samples / 16000))
      const parts = ['今天', '晚上', '吃火锅', '然后帮我叫外卖']
      const text = speech ? parts.slice(0, Math.max(1, steps)).join('') : ''
      return { text, speech }
    },
    reset() {
      samples = 0
    }
  }
}

const fake = process.env.ACKEM_VOICE_FAKE === '1'
let engine = null
let clock = null
let sessionId = 0
let outSeq = 0
let lastPartial = ''
let lastPartialAt = 0
let listening = false

function nextSeq() {
  outSeq += 1
  return outSeq
}

function emitPartial(text) {
  if (!text) return
  const now = Date.now()
  if (text === lastPartial && now - lastPartialAt < 200) return
  lastPartial = text
  lastPartialAt = now
  send(
    { type: 'transcript', stage: 'partial', sessionId, sequence: nextSeq(), text, stable: false },
    sessionId,
    outSeq
  )
}

function emitFinal(text) {
  const trimmed = String(text || lastPartial || '').trim()
  lastPartial = ''
  if (trimmed) {
    send(
      {
        type: 'transcript',
        stage: 'final',
        sessionId,
        sequence: nextSeq(),
        text: trimmed,
        language: 'zh'
      },
      sessionId,
      outSeq
    )
  }
  engine?.reset()
}

const onFrame = createParser((frame) => {
  if (frame.kind === KIND_PCM) {
    if (!listening || !engine || !clock) return
    if (frame.sessionId !== sessionId) return
    try {
      const aligned = Buffer.alloc(frame.payload.length)
      frame.payload.copy(aligned)
      const pcm = new Int16Array(aligned.buffer, aligned.byteOffset, aligned.length / 2)
      const { text, speech } = engine.pushPcm16(pcm)
      if (text) emitPartial(text)
      const chunkMs = Math.round((pcm.length / 16000) * 1000)
      if (clock.push(speech, chunkMs) === 'final') emitFinal(text)
    } catch (err) {
      send({ type: 'error', message: String(err && err.message ? err.message : err), fatal: false }, sessionId, nextSeq())
    }
    return
  }

  let msg
  try {
    msg = JSON.parse(frame.payload.toString('utf8'))
  } catch {
    send({ type: 'error', message: 'bad control json', fatal: false }, sessionId, nextSeq())
    return
  }

  if (msg.type === 'init') {
    try {
      clock = new EndpointingClock(
        msg.endpointing || {
          minSpeechDurationMs: 200,
          minSilenceDurationMs: 700,
          maxUtteranceDurationMs: 15000
        }
      )
      engine = fake ? createFakeEngine() : createRealEngine(msg)
      send({ type: 'ready', engine: 'sherpa-onnx', modelId: msg.modelId || (fake ? 'fake' : '') }, 0, nextSeq())
    } catch (err) {
      send({ type: 'error', message: String(err && err.message ? err.message : err), fatal: true }, 0, nextSeq())
      process.exit(2)
    }
    return
  }

  if (msg.type === 'start') {
    sessionId = Number(msg.sessionId) || 0
    lastPartial = ''
    lastPartialAt = 0
    listening = true
    clock?.reset()
    engine?.reset()
    return
  }

  if (msg.type === 'reset') {
    lastPartial = ''
    lastPartialAt = 0
    clock?.reset()
    engine?.reset()
    return
  }

  if (msg.type === 'stop') {
    listening = false
    emitFinal(lastPartial)
    return
  }

  if (msg.type === 'shutdown') {
    process.exit(0)
  }
})

process.stdin.on('data', onFrame)
process.stdin.on('end', () => process.exit(0))
process.stdin.resume()
