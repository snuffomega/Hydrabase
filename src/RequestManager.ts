import z from 'zod'

import { AlbumSearchResultSchema, ArtistSearchResultSchema, TrackSearchResultSchema } from './Metadata';

export const RequestSchema = z.object({
  query: z.string(),
  type: z.union([z.literal('track'), z.literal('artist'), z.literal('album'), z.literal('artist.albums'), z.literal('artist.tracks')])
})
export const ResponseSchema = z.union([z.array(TrackSearchResultSchema), z.array(ArtistSearchResultSchema), z.array(AlbumSearchResultSchema)])

export type Album = z.infer<typeof AlbumSearchResultSchema>
export type Artist = z.infer<typeof ArtistSearchResultSchema>
export type Request = z.infer<typeof RequestSchema>

export type Response<T extends keyof MessageMap = keyof MessageMap> = MessageMap[T]

export type Track = z.infer<typeof TrackSearchResultSchema>
interface MessageMap {
  album: z.infer<typeof AlbumSearchResultSchema>[];
  artist: z.infer<typeof ArtistSearchResultSchema>[];
  'artist.albums': z.infer<typeof AlbumSearchResultSchema>[];
  'artist.tracks': z.infer<typeof TrackSearchResultSchema>[];
  track: z.infer<typeof TrackSearchResultSchema>[];
}

interface PendingRequest<T extends Request['type']> {
  reject: (reason: Error) => void
  resolve: (value: Response<T>) => void
  startedAt: number
  timeout: ReturnType<typeof setTimeout>
}

export class RequestManager {
  public get averageLatencyMs(): number {
    return this.resolvedCount === 0 ? 0 : this.totalLatency / this.resolvedCount
  }
  private nonce = -1
  private readonly pending = new Map<number, PendingRequest<Request['type']>>()
  private resolvedCount = 0

  private totalLatency = 0

  constructor(private readonly timeoutMs = 15_000) {}

  public close(reason = 'Connection closed'): void {
    for (const [nonce, pending] of this.pending) {
      clearTimeout(pending.timeout)
      pending.reject(new Error(`${reason} (nonce: ${nonce})`))
    }
    this.pending.clear()
  }

  public register<T extends Request['type']>(): { nonce: number; promise: Promise<Response<T>> } {
    const nonce = ++this.nonce

    const promise = new Promise<Response<T>>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(nonce)
        reject(new Error(`Request timed out (nonce: ${nonce})`))
      }, this.timeoutMs)

      this.pending.set(nonce, {
        reject,
        resolve: resolve as PendingRequest<Request['type']>['resolve'],
        startedAt: Date.now(),
        timeout,
      })
    })

    return { nonce, promise }
  }

  public resolve<T extends Request['type']>(nonce: number, response: Response<T>): boolean {
    const pending = this.pending.get(nonce)
    if (!pending) {return false}

    const latency = Date.now() - pending.startedAt
    this.totalLatency += latency
    this.resolvedCount++

    clearTimeout(pending.timeout)
    pending.resolve(response as Response<Request['type']>)
    this.pending.delete(nonce)
    return true
  }
}
