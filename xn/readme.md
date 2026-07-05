# XN - XMBL Newtworking

XMBL's networking module.

This networking module will have all parameters and methods required to connect nodes and sequence consensus mechanisms. discovery, libp2p-jsm, and webtorrents

## Public API

```js
import {
  XNNode,
  PeerDiscovery,
  MessageRouter,
  PubSubManager,
  GossipManager,
  ConnectionManager,
} from 'xn';
```

- `XNNode` — class representing a networked XMBL node (libp2p host lifecycle).
- `PeerDiscovery` — class handling peer discovery (mDNS/DHT).
- `MessageRouter` — class routing inbound/outbound protocol messages between local handlers and peers.
- `PubSubManager` — class managing gossipsub topic subscriptions and publishing.
- `GossipManager` — class implementing the node's gossip propagation logic.
- `ConnectionManager` — class managing peer connection lifecycle (dial/hangup/backoff).
