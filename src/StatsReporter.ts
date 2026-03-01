import { sql } from 'drizzle-orm'

import type { DB } from './db'
import type { MetadataPlugin } from './Metadata'
import type { DHT_Node } from './networking/dht'
import type { Peer } from './networking/ws/peer'

import { error } from './log'

export interface ApiPeer {
  address: `0x${string}`
  confidence: number
  hostname: string | undefined
  latency: number
  plugins: string[]
  rxTotal: number
  status: "connected" | "disconnected";
  txTotal: number
  uptime: number
}

export interface NodeStats {
  address: `0x${string}`
  connectedPeers: number
  dhtNodes: string[]
  installedPlugins: string[]
  knownPeers: `0x${string}`[]
  knownPlugins: string[]
  peerData: {
    albums: number
    artists: number
    tracks: number
  }
  peers: ApiPeer[]
  timestamp: string
  votes: {
    albums: number
    artists: number
    tracks: number
  }
}

const countVotesSql = (table: 'albums' | 'artists' | 'tracks') => sql.raw(`SELECT COUNT(*) AS n FROM ${table} WHERE address = '0x0'`)
const countPeerSql = (table: 'albums' | 'artists' | 'tracks') => sql.raw(`SELECT COUNT(*) AS n FROM ${table} WHERE address != '0x0'`)

export class StatsReporter {
  constructor(
    private readonly address: `0x${string}`,
    private readonly plugins: MetadataPlugin[],
    private readonly getPeers: () => Map<`0x${string}`, Peer>,
    private readonly db: DB,
    private readonly dht: DHT_Node,
    private readonly intervalMs = 10_000
  ) {
    setInterval(() => this.report(), this.intervalMs)
  }

  public async init(): Promise<void> {
    await this.report()
  }

  private async collectStats(): Promise<NodeStats> {
    const peers = this.getPeers()

    const countRow = (rawSql: ReturnType<typeof sql.raw>) => this.db.all<{ n: number }>(rawSql)[0]?.n ?? 0

    return {
      address: this.address,
      connectedPeers: Object.keys(peers).filter(a => a !== '0x0').length,
      dhtNodes: this.dht.nodes.map(({host,port}) => `${host}:${port}`),
      installedPlugins: this.plugins.map(p => p.id),
      knownPeers: this.knownPeers().filter(a => a !== '0x0'),
      knownPlugins: this.knownPlugins(),
      peerData: {
        albums:  countRow(countPeerSql('albums')),
        artists: countRow(countPeerSql('artists')),
        tracks:  countRow(countPeerSql('tracks')),
      },
      peers: await Promise.all(peers.entries()
        .filter(([address]) => address !== '0x0')
        .map(([, { address, averageLatencyMs, historicConfidence, hostname, isOpened, plugins, rxTotal, txTotal, uptimeMs }]) => (
          { address, confidence: historicConfidence, hostname, latency: averageLatencyMs, plugins: plugins.map(({id}) => id), rxTotal, status: isOpened ? 'connected' as const : 'disconnected' as const, txTotal, uptime: uptimeMs }
        ))),
      timestamp: new Date().toISOString(),
      votes: {
        albums:  countRow(countVotesSql('albums')),
        artists: countRow(countVotesSql('artists')),
        tracks:  countRow(countVotesSql('tracks')),
      },
    }
  }

  private knownPeers(): `0x${string}`[] {
    const rows = this.db.all<{ address: `0x${string}` }>(sql.raw(`
      SELECT DISTINCT address FROM tracks
      UNION
      SELECT DISTINCT address FROM artists
      UNION
      SELECT DISTINCT address FROM albums
    `))
    return rows.map(r => r.address)
  }

  private knownPlugins(): string[] {
    const rows = this.db.all<{ plugin_id: string }>(sql.raw(`
      SELECT DISTINCT plugin_id FROM tracks
      UNION
      SELECT DISTINCT plugin_id FROM artists
      UNION
      SELECT DISTINCT plugin_id FROM albums
    `))
    return rows.map(r => r.plugin_id)
  }

  private async report(): Promise<void> {
    const client = this.getPeers().get('0x0')
    try {
      if (client?.isOpened) client.sendStats(await this.collectStats())
    } catch (err) {
      error('ERROR:', '[STATS] Failed to collect/send stats', {err})
    }
  }
}