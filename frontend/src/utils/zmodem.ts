import { Terminal } from 'xterm'
import Zmodem from 'zmodem.js/src/zmodem_browser'
import { api } from '../api/wails'

const ZMODEM_UPLOAD_CHUNK_SIZE = 1024
const PROGRESS_EMIT_INTERVAL_MS = 100
const UPLOAD_UI_YIELD_EVERY_CHUNKS = 32

export type ZmodemTransferDirection = 'upload' | 'download'
export type ZmodemTransferState = 'starting' | 'transferring' | 'retrying' | 'completed' | 'cancelled' | 'error'

export interface ZmodemTransferProgress {
  visible: boolean
  direction: ZmodemTransferDirection
  state: ZmodemTransferState
  fileName: string
  transferredBytes: number
  totalBytes: number
  bytesPerSecond: number
  startedAt: number
  statusText: string
  retryCount: number
}

interface ZmodemControllerOptions {
  onProgress?: (progress: ZmodemTransferProgress | null) => void
  translate?: (key: string, vars?: Record<string, string | number>) => string
}

interface UploadContext {
  name: string
  bytes: Uint8Array
  retries: number
}

export function bytesToTerminalString(bytes: ArrayLike<number>): string {
  const chars: string[] = []
  const chunkSize = 0x2000

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunkLength = Math.min(chunkSize, bytes.length - i)
    const chunk = new Array<number>(chunkLength)
    for (let j = 0; j < chunkLength; j++) {
      chunk[j] = bytes[i + j]
    }
    chars.push(String.fromCharCode(...chunk))
  }

  return chars.join('')
}

export function bytesToBase64(bytes: ArrayLike<number>): string {
  return btoa(bytesToTerminalString(bytes))
}

export function base64ToBytes(value: string): Uint8Array {
  const raw = atob(value)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) {
    bytes[i] = raw.charCodeAt(i)
  }
  return bytes
}

function basename(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  const segments = normalized.split('/')
  return segments[segments.length - 1] || 'file'
}

function joinPath(dir: string, name: string): string {
  return `${dir.replace(/[\\/]+$/, '')}/${name}`
}

function concatPayloads(payloads: Array<Uint8Array | number[]>): Uint8Array {
  const normalized = payloads.map(payload => payload instanceof Uint8Array ? payload : Uint8Array.from(payload))
  const total = normalized.reduce((sum, payload) => sum + payload.length, 0)
  const result = new Uint8Array(total)

  let offset = 0
  for (const payload of normalized) {
    result.set(payload, offset)
    offset += payload.length
  }

  return result
}

async function writeDownloadFile(targetPath: string, bytes: Uint8Array) {
  await api.writeFile(targetPath, Array.from(bytes))
}

export class TerminalZmodemController {
  private readonly terminal: Terminal
  private readonly sendBinary: (base64Data: string) => Promise<void>
  private readonly sentry: any
  private options: ZmodemControllerOptions
  private active = false
  private downloadDirPromise: Promise<string | null> | null = null
  private downloadCancelled = false
  private activeSession: any = null
  private progress: ZmodemTransferProgress | null = null
  private lastProgressEmitAt = 0
  private uploadContext: UploadContext | null = null
  private retryTask: Promise<void> | null = null

  constructor(terminal: Terminal, sendBinary: (base64Data: string) => Promise<void>, options: ZmodemControllerOptions = {}) {
    this.terminal = terminal
    this.sendBinary = sendBinary
    this.options = options

    this.sentry = new Zmodem.Sentry({
      to_terminal: (octets: ArrayLike<number>) => {
        const text = bytesToTerminalString(octets)
        if (text) {
          this.terminal.write(text)
        }
      },
      sender: (octets: ArrayLike<number>) => {
        void this.sendBinary(bytesToBase64(octets)).catch(error => {
          this.writeStatus(this.tr('zmodem.sendBinaryFailed', { error: String(error) }), 'error')
        })
      },
      on_detect: (detection: any) => {
        void this.handleDetection(detection)
      },
      on_retract: () => {
        if (!this.active) {
          this.writeStatus(this.tr('zmodem.handshakeRetracted'), 'warn')
        }
      },
    })
  }

  isActive(): boolean {
    return this.active
  }

  updateOptions(options: ZmodemControllerOptions) {
    this.options = { ...this.options, ...options }
    this.emitProgress(true)
  }

  cancelTransfer() {
    if (!this.activeSession) {
      return
    }

    try {
      if (typeof this.activeSession.abort === 'function' && !this.activeSession.aborted()) {
        this.activeSession.abort()
      }
    } finally {
      this.updateProgress({
        state: 'cancelled',
        statusText: this.tr('zmodem.progress.cancelled'),
      }, true)
      window.setTimeout(() => this.clearProgress(), 600)
    }
  }

  consume(base64Data: string) {
    this.sentry.consume(base64ToBytes(base64Data))
  }

  private tr(key: string, vars?: Record<string, string | number>) {
    const translated = this.options.translate?.(key, vars) || key
    if (!vars) {
      return translated
    }

    return Object.entries(vars).reduce((result, [name, value]) => {
      return result.split(`{${name}}`).join(String(value))
    }, translated)
  }

  private writeStatus(message: string, level: 'info' | 'warn' | 'error' = 'info') {
    const color = level === 'error' ? '31' : level === 'warn' ? '33' : '36'
    this.terminal.writeln(`\r\n\x1b[1;${color}m[Zmodem] ${message}\x1b[0m`)
  }

  private async handleDetection(detection: any) {
    const session = detection.confirm()
    this.active = true
    this.activeSession = session
    this.downloadCancelled = false
    this.downloadDirPromise = null
    this.uploadContext = null
    this.retryTask = null

    session.on('session_end', () => {
      this.active = false
      this.activeSession = null
      this.downloadCancelled = false
      this.downloadDirPromise = null
      this.uploadContext = null
      this.retryTask = null
      this.writeStatus(this.tr('zmodem.transferEnded'))

      if (this.progress?.state !== 'error' && this.progress?.state !== 'cancelled') {
        this.updateProgress({
          state: 'completed',
          transferredBytes: this.progress?.totalBytes ?? this.progress?.transferredBytes ?? 0,
          statusText: this.tr('zmodem.progress.completed'),
          bytesPerSecond: this.computeSpeed(this.progress?.startedAt ?? Date.now(), this.progress?.totalBytes ?? this.progress?.transferredBytes ?? 0),
        }, true)
      }

      window.setTimeout(() => this.clearProgress(), 1000)
    })

    try {
      if (session.type === 'send') {
        this.armSendSessionCompatibility(session)
        this.writeStatus(this.tr('zmodem.detectUpload'))
        await this.handleUploadSession(session)
      } else {
        this.writeStatus(this.tr('zmodem.detectDownload'))
        this.handleReceiveSession(session)
      }
    } catch (error) {
      this.active = false
      this.activeSession = null
      this.downloadCancelled = false
      this.downloadDirPromise = null
      this.uploadContext = null
      this.retryTask = null

      const message = this.tr('zmodem.transferFailed', { error: String(error) })
      this.writeStatus(message, 'error')
      this.updateProgress({
        state: 'error',
        statusText: message,
      }, true)
      window.setTimeout(() => this.clearProgress(), 1500)

      if (typeof session.abort === 'function' && !session.aborted()) {
        session.abort()
      }
    }
  }

  private armSendSessionCompatibility(session: any) {
    if (typeof session._stop_keepalive === 'function') {
      session._stop_keepalive()
    }
    session._start_keepalive_on_set_sender = false

    session._prepare_to_receive_ZRINIT = (afterConsume?: () => void) => {
      session._next_header_handler = {
        ZRINIT: (hdr: any) => {
          if (typeof session._consume_ZRINIT === 'function') {
            session._consume_ZRINIT(hdr)
          }
          if (afterConsume) {
            afterConsume()
          }
        },
        ZRPOS: (hdr: any) => {
          void this.resendFromOffset(session, typeof hdr.get_offset === 'function' ? hdr.get_offset() : 0, afterConsume)
        },
        ZACK: () => {
          session._prepare_to_receive_ZRINIT(afterConsume)
        },
      }
    }

    session._ensure_receiver_escapes_ctrl_chars = () => {
      const needsZSINIT = !session._last_ZRINIT?.escape_ctrl_chars?.() && !session._got_ZSINIT_ZACK
      if (!needsZSINIT) {
        return Promise.resolve()
      }

      return new Promise<void>((resolve) => {
        session._next_header_handler = {
          ZACK: () => {
            session._got_ZSINIT_ZACK = true
            resolve()
          },
          ZRINIT: (hdr: any) => {
            if (typeof session._consume_ZRINIT === 'function') {
              session._consume_ZRINIT(hdr)
            }
            session._got_ZSINIT_ZACK = true
            resolve()
          },
          ZRPOS: () => {
            session._ensure_receiver_escapes_ctrl_chars().then(resolve)
          },
        }
        session._send_ZSINIT()
      })
    }

    session._prepare_to_receive_ZRINIT()
  }

  private async resendFromOffset(session: any, offset: number, afterConsume?: () => void) {
    if (this.retryTask) {
      return
    }

    const uploadContext = this.uploadContext
    if (!uploadContext) {
      this.writeStatus(this.tr('zmodem.retryMissingContext', { offset }), 'error')
      session._prepare_to_receive_ZRINIT(afterConsume)
      return
    }

    if (offset < 0 || offset > uploadContext.bytes.length) {
      this.writeStatus(this.tr('zmodem.retryInvalidOffset', { offset }), 'error')
      session._prepare_to_receive_ZRINIT(afterConsume)
      return
    }

    uploadContext.retries += 1
    this.writeStatus(this.tr('zmodem.retryRequested', {
      offset,
      file: uploadContext.name,
      count: uploadContext.retries,
    }), 'warn')
    this.updateProgress({
      state: 'retrying',
      fileName: uploadContext.name,
      retryCount: uploadContext.retries,
      transferredBytes: offset,
      totalBytes: uploadContext.bytes.length,
      bytesPerSecond: this.computeSpeed(this.progress?.startedAt ?? Date.now(), offset),
      statusText: this.tr('zmodem.progress.retrying', { offset: this.formatBytes(offset) }),
    }, true)

    this.retryTask = (async () => {
      session._sending_file = true
      session._file_offset = offset
      delete session._sent_ZDATA
      await this.sendRawFileChunks(session, uploadContext.bytes, offset)
      session._sending_file = false
      session._prepare_to_receive_ZRINIT(afterConsume)
      session._send_header('ZEOF', session._file_offset)
      session._file_offset = 0
    })()

    try {
      await this.retryTask
    } finally {
      this.retryTask = null
    }
  }

  private async sendRawFileChunks(session: any, bytes: Uint8Array, startOffset: number) {
    let offset = startOffset
    let chunkCounter = 0

    while (offset < bytes.length) {
      const end = Math.min(offset + ZMODEM_UPLOAD_CHUNK_SIZE, bytes.length)
      const chunk = bytes.slice(offset, end)
      const isLast = end >= bytes.length

      session._send_file_part(chunk, isLast ? 'end_no_ack' : 'no_end_no_ack')
      this.updateProgress({
        state: 'transferring',
        transferredBytes: end,
        totalBytes: bytes.length,
        bytesPerSecond: this.computeSpeed(this.progress?.startedAt ?? Date.now(), end),
        statusText: isLast ? this.tr('zmodem.progress.finalChunk') : this.tr('zmodem.progress.uploading'),
      })

      offset = end
      chunkCounter += 1

      if (chunkCounter % UPLOAD_UI_YIELD_EVERY_CHUNKS === 0) {
        await this.yieldToUI()
      }
    }
  }

  private async handleUploadSession(session: any) {
    const homeDir = await api.getHomeDir().catch(() => '')
    this.writeStatus(this.tr('zmodem.openUploadDialog'))
    const selectedFiles = (await api.selectFiles(this.tr('zmodem.selectUploadFilesTitle'), homeDir, '')) || []

    if (!selectedFiles.length) {
      this.writeStatus(this.tr('zmodem.noFilesSelected'), 'warn')
      await session.close()
      return
    }

    this.writeStatus(this.tr('zmodem.filesSelected', { count: selectedFiles.length }))

    const files = await Promise.all(
      selectedFiles.map(async filePath => ({
        name: basename(filePath),
        bytes: Uint8Array.from(await api.readFile(filePath)),
        mtime: new Date(),
      })),
    )

    let bytesRemaining = files.reduce((sum, file) => sum + file.bytes.length, 0)

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      this.uploadContext = {
        name: file.name,
        bytes: file.bytes,
        retries: 0,
      }

      this.beginProgress('upload', file.name, file.bytes.length, this.tr('zmodem.progress.waitingPeer'))
      this.writeStatus(this.tr('zmodem.sendingFileInfo', { file: file.name, size: file.bytes.length }))

      const transfer = await session.send_offer({
        name: file.name,
        size: file.bytes.length,
        mtime: file.mtime,
        files_remaining: files.length - i,
        bytes_remaining: bytesRemaining,
      })

      if (!transfer) {
        bytesRemaining -= file.bytes.length
        this.writeStatus(this.tr('zmodem.remoteSkippedFile', { file: file.name }), 'warn')
        this.updateProgress({
          state: 'cancelled',
          transferredBytes: 0,
          totalBytes: file.bytes.length,
          statusText: this.tr('zmodem.progress.skipped'),
        }, true)
        continue
      }

      let offset = 0
      let chunkCounter = 0
      while (offset + ZMODEM_UPLOAD_CHUNK_SIZE < file.bytes.length) {
        const chunk = file.bytes.slice(offset, offset + ZMODEM_UPLOAD_CHUNK_SIZE)
        transfer.send(chunk)
        offset += chunk.length
        chunkCounter += 1

        this.updateProgress({
          state: 'transferring',
          transferredBytes: offset,
          totalBytes: file.bytes.length,
          bytesPerSecond: this.computeSpeed(this.progress?.startedAt ?? Date.now(), offset),
          statusText: this.tr('zmodem.progress.uploading'),
        })

        if (chunkCounter % UPLOAD_UI_YIELD_EVERY_CHUNKS === 0) {
          await this.yieldToUI()
        }
      }

      await transfer.end(file.bytes.slice(offset))
      bytesRemaining -= file.bytes.length
      this.writeStatus(this.tr('zmodem.uploadedFile', { file: file.name, size: file.bytes.length }))
      this.updateProgress({
        state: 'completed',
        transferredBytes: file.bytes.length,
        totalBytes: file.bytes.length,
        bytesPerSecond: this.computeSpeed(this.progress?.startedAt ?? Date.now(), file.bytes.length),
        statusText: this.tr('zmodem.progress.awaitingPeerConfirm'),
      }, true)
    }

    this.uploadContext = null
    await session.close()
  }

  private handleReceiveSession(session: any) {
    session.on('offer', (offer: any) => {
      void this.handleReceiveOffer(offer)
    })
    session.start()
  }

  private async getDownloadDirectory(): Promise<string | null> {
    if (this.downloadCancelled) {
      return null
    }

    if (!this.downloadDirPromise) {
      this.downloadDirPromise = (async () => {
        const homeDir = await api.getHomeDir().catch(() => '')
        const dir = await api.selectDirectory(this.tr('zmodem.selectDownloadDirTitle'), homeDir)
        return dir || null
      })().catch(error => {
        this.downloadDirPromise = null
        throw error
      })
    }

    return this.downloadDirPromise
  }

  private async handleReceiveOffer(offer: any) {
    try {
      const details = offer.get_details()
      const downloadDir = await this.getDownloadDirectory()

      if (!downloadDir) {
        this.downloadCancelled = true
        this.writeStatus(this.tr('zmodem.skippedFile', { file: details.name }), 'warn')
        offer.skip()
        return
      }

      this.beginProgress('download', details.name, details.size || 0, this.tr('zmodem.progress.waitingRemote'))

      const payloads: Uint8Array[] = []
      let receivedBytes = 0
      const payloadResult = await offer.accept({
        on_input: (payload: Uint8Array) => {
          payloads.push(payload)
          receivedBytes += payload.length
          this.updateProgress({
            state: 'transferring',
            transferredBytes: receivedBytes,
            totalBytes: details.size || receivedBytes,
            bytesPerSecond: this.computeSpeed(this.progress?.startedAt ?? Date.now(), receivedBytes),
            statusText: this.tr('zmodem.progress.downloading'),
          })
        },
      })

      const fileBytes = concatPayloads((payloadResult as Array<Uint8Array | number[]> | undefined) || payloads)
      const targetPath = joinPath(downloadDir, basename(details.name))

      await writeDownloadFile(targetPath, fileBytes)
      this.writeStatus(this.tr('zmodem.savedFile', { file: details.name, path: targetPath }))
      this.updateProgress({
        state: 'completed',
        transferredBytes: fileBytes.length,
        totalBytes: details.size || fileBytes.length,
        bytesPerSecond: this.computeSpeed(this.progress?.startedAt ?? Date.now(), fileBytes.length),
        statusText: this.tr('zmodem.progress.downloadComplete'),
      }, true)
    } catch (error) {
      const message = this.tr('zmodem.receiveFailed', { error: String(error) })
      this.writeStatus(message, 'error')
      this.updateProgress({
        state: 'error',
        statusText: message,
      }, true)
      offer.skip()
    }
  }

  private beginProgress(direction: ZmodemTransferDirection, fileName: string, totalBytes: number, statusText: string) {
    this.progress = {
      visible: true,
      direction,
      state: 'starting',
      fileName,
      transferredBytes: 0,
      totalBytes,
      bytesPerSecond: 0,
      startedAt: Date.now(),
      statusText,
      retryCount: 0,
    }
    this.emitProgress(true)
  }

  private updateProgress(partial: Partial<ZmodemTransferProgress>, force = false) {
    if (!this.progress) {
      return
    }

    this.progress = {
      ...this.progress,
      ...partial,
      visible: true,
    }
    this.emitProgress(force)
  }

  private clearProgress() {
    this.progress = null
    this.emitProgress(true)
  }

  private emitProgress(force = false) {
    const now = Date.now()
    if (!force && this.progress?.state === 'transferring' && now - this.lastProgressEmitAt < PROGRESS_EMIT_INTERVAL_MS) {
      return
    }

    this.lastProgressEmitAt = now
    this.options.onProgress?.(this.progress ? { ...this.progress } : null)
  }

  private computeSpeed(startedAt: number, transferredBytes: number): number {
    const elapsedSeconds = Math.max((Date.now() - startedAt) / 1000, 0.001)
    return transferredBytes / elapsedSeconds
  }

  private yieldToUI() {
    return new Promise<void>(resolve => window.setTimeout(resolve, 0))
  }

  private formatBytes(value: number): string {
    if (!Number.isFinite(value) || value <= 0) {
      return '0 B'
    }
    const units = ['B', 'KB', 'MB', 'GB']
    let size = value
    let unitIndex = 0
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex += 1
    }
    return `${size >= 100 || unitIndex === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unitIndex]}`
  }
}
