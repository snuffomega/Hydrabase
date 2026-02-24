import { CONFIG } from "../../config";
import { AuthSchema } from "../../networking/ws/client";
import { Crypto, Signature } from "../../Crypto";

import z from 'zod'
import type { Peer } from '../../networking/ws/peer'

export const CapabilitySchema = z.object({
  userAgent: z.string(),
  hips: z.record(z.coerce.number(), z.number()),
  plugins: z.array(z.string()),
})
export type Capability = z.infer<typeof CapabilitySchema>

const IMPLEMENTED_HIPS: Record<number, number> = {
  1: 1, // HIP1 — Capability exchange
  2: 1, // HIP2 — Message schema
  3: 1, // HIP3 — Authentication
  4: 1, // HIP4 — Gossip / peer announcement
}

export class HIP1_Conn_Capabilities {
  constructor(private readonly peer: Peer) {}

  get capabilities(): Capability {
    return {
      userAgent: `Hydrabase/${Bun.file('VERSION').toString().trim() ?? 'unknown'}`,
      hips: IMPLEMENTED_HIPS,
      plugins: this.peer.plugins.map(({id}) => id),
    }
  }

  static validateCapability(raw: unknown): CapabilityValidationResult {
    const parsed = CapabilitySchema.safeParse(raw)
    if (!parsed.success) return { ok: false, reason: 'parse_failed' }
    const hip1Version = parsed.data.hips[1]
    if (hip1Version === undefined) return { ok: false, reason: 'missing_hip1' }
    if (hip1Version < IMPLEMENTED_HIPS[1]!) return { ok: false, reason: 'hip1_version_too_low' }
    return { ok: true, capability: parsed.data }
  }
}

type CapabilityRejectionReason = 'parse_failed' | 'missing_hip1' | 'hip1_version_too_low'
type CapabilityValidationResult = { ok: true; capability: Capability } | { ok: false; reason: CapabilityRejectionReason }

const peerSupportsHip = (capability: Capability, hip: number, minVersion: number = 1): boolean => {
  const version = capability.hips[hip]
  return version !== undefined && version >= minVersion
}
const peerHasPlugin = (capability: Capability, pluginId: string): boolean => capability.plugins.includes(pluginId)
// TODO: actually use negotiated capabilities


type Auth =
  | { apiKey: string; signature?: undefined }
  | { apiKey?: undefined; signature: Signature }
  | { apiKey: string; signature: Signature }

const prove = {
  server: {
    address: (crypto: Crypto, port: number) => new Response(JSON.stringify({
      signature: crypto.sign(`I am ws://${CONFIG.serverHostname}:${port}`).toString(),
      address: crypto.address
    }))
  },
  client: {
    address: (crypto: Crypto, peerHostname: `ws://${string}`, selfHostname: `ws://${string}`) => ({
      'x-signature': crypto.sign(`I am connecting to ${peerHostname}`).toString(),
      'x-address': crypto.address,
      "x-hostname": selfHostname
    })
  }
}

const verify = {
  client: {
    address: async (hostname: `ws://${string}`) => {
      const res = await fetch(hostname.replace('ws://', 'http://') + '/auth')
      const data = await res.text()
      const auth = AuthSchema.parse(JSON.parse(data))
      const signature = Signature.fromString(auth.signature)
      if (!signature.verify(`I am ${hostname}`, auth.address)) {
        console.warn('WARN:', 'Invalid authentication from server')
        return false
      }
      return auth.address
    }
  },
  server: {
    address: async (headers: { [k: string]: string }, listenPort: number): Promise<`0x${string}` | Response> => {
      const {
        'x-api-key': apiKey,
        'x-signature': _signature,
        'x-address': address
      } = headers
      const signature = _signature ? Signature.fromString(_signature) : undefined
      const auth = apiKey !== undefined || signature !== undefined ? { apiKey, signature } as Auth : undefined

      if (!auth) return new Response('Missing authentication', { status: 400 })
      if (auth.apiKey && auth.apiKey !== CONFIG.apiKey) return new Response('Invalid API key', { status: 401 })
      else if (auth.signature) {
        if (!address) return new Response('Missing address header', { status: 400 })
        if (!auth.signature.verify(`I am connecting to ws://${CONFIG.serverHostname}:${listenPort}`, address)) return new Response('Authentication failed', { status: 403 })
      }

      return address as `0x${string}`
    },
    hostname: async (headers: { [k: string]: string }, address: `0x${string}`): Promise<Response | `ws://${string}`> => {
      const hostname = headers['x-hostname']
      if (!hostname) return new Response('Missing hostname header', { status: 400 })
      const data = await (await fetch(hostname.replace('ws://', 'http://') + '/auth')).text()
      if (!Signature.fromString(AuthSchema.parse(JSON.parse(data)).signature).verify(`I am ${hostname}`, address)) return new Response('Invalid authentication from your server', { status: 401 })
      return hostname as `ws://${string}`
    }
  }
}

export class HIP3_CONN_Authentication {
  static proveServerAddress = (crypto: Crypto, listenPort: number) => prove.server.address(crypto, listenPort)
  static proveClientAddress = (crypto: Crypto, peerHostname: `ws://${string}`, selfHostname: `ws://${string}`) => prove.client.address(crypto, peerHostname, selfHostname)
  static verifyClientAddress = (peerHostname: `ws://${string}`) => verify.client.address(peerHostname)
  static verifyServerAddress = (headers: { [k: string]: string }, listenPort: number) => verify.server.address(headers, listenPort)
  static verifyServerHostname = (headers: { [k: string]: string }, peerAddress: `0x${string}`) => verify.server.hostname(headers, peerAddress)
}
