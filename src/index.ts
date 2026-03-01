import { error } from './log';
import Node from './Node'

process.on('unhandledRejection', (err) => error('ERROR:', '[MAIN] Unhandled rejection', {err}))
process.on('uncaughtException', (err) => error('ERROR:', '[MAIN] Uncaught exception', {err}))

const node = await Node.init()

const artists = await node.search('artist', 'jay z')
/*Const track = */await node.search('track', 'dont stop me now')
/*Const album = */await node.search('album', 'made in england')
// Log('LOG:', 'Artist results:', artists)
// Log('LOG:', 'Track results:', track)
// Log('LOG:', 'Album results:', album)
if (artists[0]) {
  await node.search('artist.tracks', artists[0].soul_id)
  await node.search('artist.albums', artists[0].soul_id)
}

// TODO: Merge duplicate artists from diff plugins
