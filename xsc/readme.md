# XSC - XMBL Storage and Compute

XMBL's Storage and Compute module.

Nodes on the system may offer web services to users at cost based on fair-market for resources available. Nodes are tested by other nodes periodically to verify availability. Payments for services are periodically sent to users via an xmbl cubic ledger tx.

## Public API

```js
import {
  StorageShard,
  StorageNode,
  ComputeRuntime,
  MarketPricing,
  AvailabilityTester,
  CoordinateDelivery,
} from 'xsc';
```

- `StorageShard` — class representing one shard of stored/erasure-coded data.
- `StorageNode` — class representing a node offering storage capacity to the network.
- `ComputeRuntime` — class executing WASM compute jobs on behalf of a requester.
- `MarketPricing` — class computing fair-market pricing for storage/compute resources.
- `AvailabilityTester` — class periodically testing peer nodes for storage/compute availability.
- `CoordinateDelivery` — class coordinating delivery of computed/stored results back to the requester.