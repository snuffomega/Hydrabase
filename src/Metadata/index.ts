import z from 'zod';

import type { Repositories } from '../db';
import type Peers from '../Peers';
import type { Request } from '../RequestManager'

import { CONFIG } from '../config';
import { log, warn } from '../log';

export const TrackSearchResultSchema = z.object({
  album: z.string(),
  artists: z.array(z.string()),
  confidence: z.number().min(-1).max(1),
  duration_ms: z.number(),
  external_urls: z.record(z.string(), z.url()),
  id: z.string(),
  image_url: z.url(),
  name: z.string(),
  plugin_id: z.string(),
  popularity: z.number(),
  preview_url: z.string(),
  soul_id: z.string()
})

export type TrackSearchResult = z.infer<typeof TrackSearchResultSchema>

export const ArtistSearchResultSchema = z.object({
  confidence: z.number().min(-1).max(1),
  external_urls: z.object({
    itunes: z.url(),
    spotify: z.url()
  }).partial(),
  followers: z.number(),
  genres: z.array(z.string()),
  id: z.string(),
  image_url: z.string(),
  name: z.string(),
  plugin_id: z.string(),
  popularity: z.number(),
  soul_id: z.string()
})
export type ArtistSearchResult = z.infer<typeof ArtistSearchResultSchema>

export const AlbumSearchResultSchema = z.object({
  album_type: z.string(),
  artists: z.array(z.string()),
  confidence: z.number().min(-1).max(1),
  external_urls: z.object({
    itunes: z.url(),
    spotify: z.url()
  }).partial(),
  id: z.string(),
  image_url: z.url(),
  name: z.string(),
  plugin_id: z.string(),
  release_date: z.string(),
  soul_id: z.string(),
  total_tracks: z.number()
})
export type AlbumSearchResult = z.infer<typeof AlbumSearchResultSchema>

export interface MetadataPlugin {
  albumTracks: (id: string, peers: Peers) => Promise<TrackSearchResult[]>
  artistAlbums: (id: string, peers: Peers) => Promise<AlbumSearchResult[]>
  artistTracks: (id: string, peers: Peers) => Promise<TrackSearchResult[]>
  id: string
  searchAlbum: (query: string) => Promise<AlbumSearchResult[]>
  searchArtist: (query: string) => Promise<ArtistSearchResult[]>
  searchTrack: (query: string) => Promise<TrackSearchResult[]>
}

export interface SearchResult {
  album: AlbumSearchResult
  'album.tracks': TrackSearchResult
  artist: ArtistSearchResult
  'artist.albums': AlbumSearchResult
  'artist.tracks': TrackSearchResult
  track: TrackSearchResult
}

const computeConfidence = (artistConfidences: number[], peerConfidences: number[], k = 1.0): number => {
  if (peerConfidences.length === 0) return 0.5

  let numerator = 0
  let denominator = k

  for (let i = 0; i < peerConfidences.length; i++) {
    const artistConfidence = artistConfidences[i] ?? 0
    numerator += artistConfidence * ((peerConfidences[i] ?? 0) - 0.5) * 2
    denominator += artistConfidence
  }

  return ((numerator / denominator) / 2) + 0.5
}

const matchId = (items: ((AlbumSearchResult | ArtistSearchResult) & { address: `0x${string}` })[], peers: Peers): undefined | { confidence: number; id: string } => {
  const votes = new Map<string, { itemConfidences: number[]; peerConfidences: number[], }>()
  for (const item of items) {
    const pastVotes = votes.get(item.id) ?? { itemConfidences: [], peerConfidences: [] }
    votes.set(item.id, {
      itemConfidences: [...pastVotes.itemConfidences, item.confidence],
      peerConfidences: [...pastVotes.peerConfidences, peers.getConfidence(item.address)]
    })
  }

  const confidences = new Map<string, number>()
  for (const entry of votes) {
    const [artistId, votes] = entry
    confidences.set(artistId, computeConfidence(votes.itemConfidences, votes.peerConfidences))
  }

  const id = confidences.size ? [...confidences.entries()].reduce((a, b) => !a || b[1] > a[1] ? b : a, [...confidences.entries()][0]) : undefined
  return id ? { confidence: id[1], id: id[0] } : undefined
}

export default class MetadataManager implements MetadataPlugin {
  public readonly id = 'Hydrabase'
  public get installedPlugins(): MetadataPlugin[] { return this.plugins }

  constructor(private readonly plugins: MetadataPlugin[], private readonly db: Repositories) {}

  private static merge<T extends { address: `0x${string}`; soul_id: string, }>(primary: T[], secondary: T[]): T[] {
    const seen = new Set(primary.map(r => `${r.soul_id}:${r.address}`))
    return [...primary, ...secondary.filter(r => !seen.has(`${r.soul_id}:${r.address}`))]
  }

  async albumTracks(albumSoulId: string, peers: Peers): Promise<TrackSearchResult[]> {
    const albums = this.db.album.lookupBySoulId(albumSoulId)
    const albumIds = new Map<string, string>()
    const pluginResults = (await Promise.all(this.plugins.map(async p => {
      const pluginAlbums = albums.filter(({plugin_id}) => plugin_id === p.id)
      const {id} = pluginAlbums.find(({address}) => address === '0x0') ?? {}
      if (id) {
        albumIds.set(p.id, id)
        return (await p.albumTracks(id, peers)).map(result => ({ ...result, soul_id: `soul_${Bun.hash(`${result.plugin_id}:${result.id}`.slice(0, CONFIG.soulIdCutoff))}` }))
      }

      const bestId = matchId(pluginAlbums, peers)
      if (bestId) {
        albumIds.set(p.id, bestId.id)
        return (await p.albumTracks(bestId.id, peers)).map(result => ({ ...result, confidence: (result.confidence+bestId.confidence)/2, soul_id: `soul_${Bun.hash(`${result.plugin_id}:${result.id}`.slice(0, CONFIG.soulIdCutoff))}` }))
      }
      return []
    })))
    const results = pluginResults.flat().map(result => ({ ...result, address: '0x0' as const }))
    for (const result of results) {this.db.track.upsertFromPlugin(result)}
    const cached = this.db.track.lookupByArtistIds(albumIds)
    return MetadataManager.merge(results, cached)
  }

  async artistAlbums(artistSoulId: string, peers: Peers): Promise<AlbumSearchResult[]> {
    const artists = this.db.artist.lookupBySoulId(artistSoulId)
    const artistIds = new Map<string, string>()
    const pluginResults = (await Promise.all(this.plugins.map(async p => {
      const pluginArtists = artists.filter(({plugin_id}) => plugin_id === p.id)
      const { id } = pluginArtists.find(({address}) => address === '0x0') ?? {}
      if (id) {
        artistIds.set(p.id, id)
        return (await p.artistAlbums(id, peers)).map(result => ({ ...result, soul_id: `soul_${Bun.hash(`${result.plugin_id}:${result.id}`.slice(0, CONFIG.soulIdCutoff))}` }))
      }

      const bestId = matchId(pluginArtists, peers)
      if (bestId) {
        artistIds.set(p.id, bestId.id)
        return (await p.artistAlbums(bestId.id, peers)).map(result => ({ ...result, confidence: (result.confidence+bestId.confidence)/2, soul_id: `soul_${Bun.hash(`${result.plugin_id}:${result.id}`.slice(0, CONFIG.soulIdCutoff))}` }))
      }
      return []
    })))
    const results = pluginResults.flat().map(result => ({ ...result, address: '0x0' as const }))
    for (const result of results) {this.db.album.upsertFromPlugin(result)}
    const cached = this.db.album.lookupByArtistIds(artistIds)
    return MetadataManager.merge(results, cached)
  }

  async artistTracks(artistSoulId: string, peers: Peers): Promise<TrackSearchResult[]> {
    const artists = this.db.artist.lookupBySoulId(artistSoulId)
    const artistIds = new Map<string, string>()
    const pluginResults = (await Promise.all(this.plugins.map(async p => {
      const pluginArtists = artists.filter(({plugin_id}) => plugin_id === p.id)
      const { id } = pluginArtists.find(({address}) => address === '0x0') ?? {}
      if (id) {
        artistIds.set(p.id, id)
        return (await p.artistTracks(id, peers)).map(result => ({ ...result, soul_id: `soul_${Bun.hash(`${result.plugin_id}:${result.id}`.slice(0, CONFIG.soulIdCutoff))}` }))
      }

      const bestId = matchId(pluginArtists, peers)
      if (bestId) {
        artistIds.set(p.id, bestId.id)
        return (await p.artistTracks(bestId.id, peers)).map(result => ({ ...result, confidence: (result.confidence+bestId.confidence)/2, soul_id: `soul_${Bun.hash(`${result.plugin_id}:${result.id}`.slice(0, CONFIG.soulIdCutoff))}` }))
      }
      return []
    })))
    const results = pluginResults.flat().map(result => ({ ...result, address: '0x0' as const }))
    for (const result of results) {this.db.track.upsertFromPlugin(result)}
    const cached = this.db.track.lookupByArtistIds(artistIds)
    return MetadataManager.merge(results, cached)
  }

  public async handleRequest<T extends Request['type']>(request: Request & { type: T }, peers: Peers) {
    log('LOG:', `[META] Searching for ${request.type}: ${request.query}`)
    const results = request.type === 'track' ? await this.searchTrack(request.query)
      : request.type === 'artist' ? await this.searchArtist(request.query)
      : request.type === 'album' ? await this.searchAlbum(request.query)
      : request.type === 'artist.albums' ? await this.artistAlbums(request.query, peers)
      : request.type === 'artist.tracks' ? await this.artistTracks(request.query, peers)
      : request.type === 'album.tracks' ? await this.albumTracks(request.query, peers)
      : warn('DEVWARN:', `[HIP2] Invalid request ${request.type}`)
    if (!results) return []
    log('LOG:', `[META] Received ${results.length} results`)
    return results
  }

  async searchAlbum(query: string): Promise<AlbumSearchResult[]> {
    const [cached, ...pluginResults] = await Promise.all([
      this.db.album.searchByName(query),
      ...this.plugins.map(async p =>
        (await p.searchAlbum(query)).map(result => ({ ...result, soul_id: `soul_${Bun.hash(`${result.plugin_id}:${result.id}`.slice(0, CONFIG.soulIdCutoff))}` }))
      )
    ])
    const results = pluginResults.flat().map(result => ({ ...result, address: '0x0' as const }))
    for (const result of results) {this.db.album.upsertFromPlugin(result)}
    return MetadataManager.merge(results, cached)
  }

  async searchArtist(query: string): Promise<ArtistSearchResult[]> {
    const [cached, ...pluginResults] = await Promise.all([
      this.db.artist.searchByName(query),
      ...this.plugins.map(async p =>
        (await p.searchArtist(query)).map(result => ({ ...result, soul_id: `soul_${Bun.hash(`${result.plugin_id}:${result.id}`.slice(0, CONFIG.soulIdCutoff))}` }))
      )
    ])
    const results = pluginResults.flat().map(result => ({ ...result, address: '0x0' as const }))
    for (const result of results) {this.db.artist.upsertFromPlugin(result)}
    return MetadataManager.merge(results, cached)
  }

  async searchTrack(query: string): Promise<TrackSearchResult[]> {
    const [cached, ...pluginResults] = await Promise.all([
      this.db.track.searchByName(query),
      ...this.plugins.map(async p =>
        (await p.searchTrack(query)).map(result => ({ ...result, soul_id: `soul_${Bun.hash(`${result.plugin_id}:${result.id}`.slice(0, CONFIG.soulIdCutoff))}` }))
      )
    ])
    const results = pluginResults.flat().map(result => ({ ...result, address: '0x0' as const }))
    for (const result of results) {this.db.track.upsertFromPlugin(result)}
    return MetadataManager.merge(results, cached)
  }
}
