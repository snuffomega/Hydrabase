import natUpnp from 'nat-upnp'

import { CONFIG } from '../config';
import { error } from '../log';

const upnp = natUpnp.createClient();
const mapPort = (port: number, description: string, protocol: 'TCP' | 'UDP' = 'TCP') => upnp.portMapping({ description, private: port, protocol, public: port, ttl: CONFIG.upnpTTL }, err => { if (err) {error('ERROR:', "[UPnP] Couldn't automatically port forward", `- ${err.stack?.split('\n')[0]}`)} })
export const portForward = (port: number, description: string, protocol: 'TCP' | 'UDP' = 'TCP') => {
  mapPort(port, description, protocol)
  setInterval(() => mapPort(port, description, protocol), CONFIG.upnpReannounce*1_000)
}
