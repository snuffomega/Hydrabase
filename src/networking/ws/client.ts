import z from 'zod'
import { Crypto } from "../../Crypto"
import { HIP3_CONN_Authentication } from '../../protocol/HIP3/authentication'
import type Peers from '../../Peers'

export const AuthSchema = z.object({
  signature: z.string(),
  address: z.string().regex(/^0x/i, { message: "Address must start with 0x" }).transform((val) => val as `0x${string}`),
})

export default class WebSocketClient {
  private socket!: WebSocket
  private _isOpened = false
  private messageHandler?: (message: string) => void
  private closeHandler?: () => void
  private openHandler?: () => void
  private _retryQueue: Array<() => void> = []
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private _reconnectDelay = 1000
  private readonly _maxReconnectDelay = 30000

  private constructor(
    crypto: Crypto,
    public readonly address: `0x${string}`,
    public readonly hostname: `ws://${string}`,
    private readonly selfHostname: `ws://${string}`
  ) {
    this._connect(crypto)
  }

  private _connect(crypto: Crypto) {
    const headers = HIP3_CONN_Authentication.proveClientAddress(crypto, this.hostname, this.selfHostname)
    console.log('LOG:', `[CLIENT] Connecting to server ${this.hostname}`)
    this.socket = new WebSocket(this.hostname, { headers })

    this.socket.addEventListener('open', () => {
      console.log('LOG:', `[CLIENT] Connected to server ${this.hostname} ${this.address}`)
      this._isOpened = true
      this._reconnectDelay = 1000 // reset backoff on success
      this._flushQueue()
      this.openHandler?.()
    })

    this.socket.addEventListener('close', ev => {
      console.log('LOG:', `[CLIENT] Connection closed with server ${this.hostname} ${this.address}`, `- ${ev.reason}`)
      this._isOpened = false
      this.closeHandler?.()
      this._scheduleReconnect(crypto)
    })

    this.socket.addEventListener('error', err => {
      console.warn('WARN:', `[CLIENT] Connection failed with server ${this.hostname} ${this.address}`, err)
      this._isOpened = false
      this.closeHandler?.()
      // close event fires after error, so reconnect is handled there
    })

    this.socket.addEventListener('message', message => this.messageHandler?.(message.data))
  }

  static readonly init = async (crypto: Crypto, hostname: `ws://${string}`, selfHostname: `ws://${string}`, peers: Peers) => {
    const address = await HIP3_CONN_Authentication.verifyClientAddress(hostname)
    if (!address) return false
    if (peers.has(address)) {
      console.warn('WARN:', `[CLIENT] Already connected/connecting to peer ${address}`)
      return false
    }
    if (address === crypto.address) {
      console.warn('WARN:', `[CLIENT] Not connecting to self`)
      return false
    }
    return new WebSocketClient(crypto, address, hostname, selfHostname)
  }

  private _scheduleReconnect(crypto: Crypto) {
    if (this._reconnectTimer) return
    console.log('LOG:', `[CLIENT] Reconnecting to ${this.address} ${this.hostname} in ${this._reconnectDelay}ms...`)
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null
      this._connect(crypto)
    }, this._reconnectDelay)
    this._reconnectDelay = Math.min(this._reconnectDelay * 2, this._maxReconnectDelay)
  }

  private _flushQueue() {
    const queue = this._retryQueue.splice(0)
    for (const fn of queue) fn()
  }

  public readonly close = () => {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer)
      this._reconnectTimer = null
    }
    this._retryQueue = []
    this.socket.close()
  }

  get isOpened() {
    return this._isOpened
  }

  send(data: string) {
    if (this._isOpened) this.socket.send(data)
    else this._retryQueue.push(() => this.socket.send(data))
  }

  public onMessage(handler: (message: string) => void) {
    this.messageHandler = (msg) => handler(msg)
  }
  public onClose(handler: () => void) {
    this.closeHandler = () => handler()
  }
  public onOpen(handler: () => void) {
    this.openHandler = () => handler()
  }
}
