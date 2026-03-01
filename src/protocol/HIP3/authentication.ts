import type { Account } from "../../Crypto/Account";

import { CONFIG } from "../../config";
import { Signature } from "../../Crypto/Signature";
import { log, warn } from "../../log";
import { AuthSchema } from "../../networking/ws/client";

type Auth =
  | { apiKey: string; signature: Signature }
  | { apiKey: string; signature?: undefined }
  | { apiKey?: undefined; signature: Signature }

const prove = {
  client: {
    address: (account: Account, peerHostname: `ws://${string}`) => ({
      'x-address': account.address,
      "x-hostname": `ws://${CONFIG.serverHostname}:${CONFIG.serverPort}`,
      'x-signature': account.sign(`I am connecting to ${peerHostname}`).toString()
    })
  },
  server: {
    address: (account: Account, port: number) => new Response(JSON.stringify({
      address: account.address,
      signature: account.sign(`I am ws://${CONFIG.serverHostname}:${port}`).toString()
    }))
  }
}

const verifyAuth = (auth: Auth | undefined, address: string | undefined): [number, string] | true => {
  if (!auth) return [400, 'Missing authentication']
  if (auth.apiKey && auth.apiKey !== CONFIG.apiKey) return [401, 'Invalid API key']
  else if (auth.signature) {
    if (!address) return [400, 'Missing address header']
    if (!auth.signature.verify(`I am connecting to ws://${CONFIG.serverHostname}:${CONFIG.serverPort}`, address)) return [403, 'Authentication failed']
  }
  return true
}

const verify = {
  client: {
    address: async (hostname: `ws://${string}`) => {
      log('LOG:', `[HIP3] Verifying server address ${hostname}`)
      const res = await fetch(`${hostname.replace('ws://', 'http://')  }/auth`)
      const data = await res.text()
      const auth = AuthSchema.parse(JSON.parse(data))
      const signature = Signature.fromString(auth.signature)
      if (!signature.verify(`I am ${hostname}`, auth.address)) {
        warn('DEVWARN:', '[HIP3] Invalid authentication from server')
        return false
      }
      return auth.address
    }
  },
  server: {
    address: (headers: Record<string, string>): `0x${string}` | Response => {
      log('LOG:', `[HIP3] Verifying client address`)
      const { 'sec-websocket-protocol': protocol, 'x-address': address, 'x-api-key': _apiKey, 'x-signature': _signature } = headers
      const signature = _signature ? Signature.fromString(_signature) : undefined

      const keyProto = protocol?.split(',').map(s => s.trim()).find(s => s.startsWith('x-api-key-'))
      const apiKey= _apiKey ?? keyProto?.replace('x-api-key-', '')

      const auth = apiKey !== undefined || signature !== undefined ? { apiKey, signature } as Auth : undefined

      const res = verifyAuth(auth, address)
      if (res !== true) return new Response(res[1], { status: res[0] })

      return address as `0x${string}` ?? '0x0'
    },
    hostname: async (headers: Record<string, string>, address: `0x${string}`): Promise<`ws://${string}` | Response> => {
      log('LOG:', `[HIP3] Verifying client hostname ${address}`)
      if (address === '0x0') {return 'ws://'}
      const hostname = headers['x-hostname']
      if (!hostname) {return new Response('Missing hostname header', { status: 400 })}
      const data = await (await fetch(`${hostname.replace('ws://', 'http://')  }/auth`)).text()
      if (!Signature.fromString(AuthSchema.parse(JSON.parse(data)).signature).verify(`I am ${hostname}`, address)) {return new Response('Invalid authentication from your server', { status: 401 })}
      return hostname as `ws://${string}`
    }
  }
}

export const HIP3_CONN_Authentication =  {
  proveClientAddress: (account: Account, peerHostname: `ws://${string}`) => prove.client.address(account, peerHostname),
  proveServerAddress: (account: Account, listenPort: number) => prove.server.address(account, listenPort),
  verifyClientAddress: async (peerHostname: `ws://${string}`): Promise<`0x${string}` | false> => {
    try {
      return await verify.client.address(peerHostname)
    } catch (e) {
      if ((e as { code: string }).code === 'ConnectionRefused') {return false}
      throw e
    }
  },
  verifyServerAddress: (headers: Record<string, string>) => verify.server.address(headers),
  verifyServerHostname: (headers: Record<string, string>, peerAddress: `0x${string}`) => verify.server.hostname(headers, peerAddress),
}
