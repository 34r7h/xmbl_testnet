import { describe, it, expect, afterEach } from '@jest/globals';
import net from 'net';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { EventEmitter } from 'events';
import { createControlServer } from '../../core/control-socket.js';

// Verifies the handoff message-relay TRANSPORT seam on the node control socket: the `publish` op
// broadcasts onto core.xn, and the `subscribe` op holds the connection open and streams one JSON
// line per received pubsub message, cleaning up its listener on disconnect. The underlying libp2p
// floodsub delivery between two real nodes is covered separately by xn/__tests__/pubsub.test.js;
// here we mock core.xn (an EventEmitter mirroring xn's publish/subscribe/`message:<topic>` API) so
// the SOCKET wiring is tested deterministically without standing up a libp2p mesh.

function mockCore() {
  const xn = new EventEmitter();
  xn.published = [];
  xn.subscribed = [];
  xn.publish = async (topic, data) => { xn.published.push({ topic, data }); };
  xn.subscribe = async (topic) => { xn.subscribed.push(topic); };
  return { xn, config: { roles: {} } };
}

// A tiny newline-delimited-JSON client: connect, send lines, and await the next reply line(s).
function connectClient(sockPath) {
  const sock = net.connect(sockPath);
  sock.setEncoding('utf8');
  let buf = '';
  const waiters = [];
  const queue = [];
  sock.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      if (!line.trim()) continue;
      const obj = JSON.parse(line);
      if (waiters.length) waiters.shift()(obj); else queue.push(obj);
    }
  });
  const next = () => new Promise((res) => { if (queue.length) res(queue.shift()); else waiters.push(res); });
  const send = (o) => sock.write(JSON.stringify(o) + '\n');
  const ready = new Promise((res) => sock.on('connect', res));
  return { sock, next, send, ready, close: () => sock.destroy() };
}

describe('control socket — handoff message-relay transport (publish + streaming subscribe)', () => {
  let server; let sockPath; let client;
  afterEach(async () => {
    if (client) client.close();
    if (server) await new Promise((r) => server.close(r));
    if (sockPath) { try { fs.rmSync(sockPath, { force: true }); } catch { /* */ } }
  });

  async function boot(core) {
    sockPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ctrlsock-')), 'node.sock');
    server = await createControlServer({ core, config: core.config, sockPath, statusSnapshot: () => ({}) });
    client = connectClient(sockPath);
    await client.ready;
  }

  it('publish op broadcasts onto core.xn and acks {ok,topic}', async () => {
    const core = mockCore();
    await boot(core);
    client.send({ op: 'publish', topic: 'handoff:agent:bob', data: { envelope_id: 'e1', hello: 1 } });
    const reply = await client.next();
    expect(reply).toEqual({ ok: true, topic: 'handoff:agent:bob' });
    expect(core.xn.published).toEqual([{ topic: 'handoff:agent:bob', data: { envelope_id: 'e1', hello: 1 } }]);
  });

  it('publish op rejects a missing topic without touching the network', async () => {
    const core = mockCore();
    await boot(core);
    client.send({ op: 'publish', data: { x: 1 } });
    expect(await client.next()).toMatchObject({ ok: false });
    expect(core.xn.published).toHaveLength(0);
  });

  it('subscribe op streams a line per received message and cleans up on disconnect', async () => {
    const core = mockCore();
    await boot(core);
    client.send({ op: 'subscribe', topic: 'handoff:agent:bob' });
    // first line confirms the subscription
    expect(await client.next()).toEqual({ ok: true, event: 'subscribed', topic: 'handoff:agent:bob' });
    expect(core.xn.subscribed).toEqual(['handoff:agent:bob']);
    expect(core.xn.listenerCount('message:handoff:agent:bob')).toBe(1);

    // an inbound pubsub message on the topic is streamed to the client verbatim
    core.xn.emit('message:handoff:agent:bob', { envelope_id: 'e9', from: 'alice', text: 'hi' });
    expect(await client.next()).toEqual({ ok: true, event: 'message', topic: 'handoff:agent:bob', data: { envelope_id: 'e9', from: 'alice', text: 'hi' } });

    // a message on a DIFFERENT topic is not delivered to this subscriber
    core.xn.emit('message:handoff:agent:carol', { envelope_id: 'x' });
    core.xn.emit('message:handoff:agent:bob', { envelope_id: 'e10' });
    expect(await client.next()).toEqual({ ok: true, event: 'message', topic: 'handoff:agent:bob', data: { envelope_id: 'e10' } });

    // disconnect removes the listener (no leak across dropped relays)
    client.close();
    await new Promise((r) => setTimeout(r, 50));
    expect(core.xn.listenerCount('message:handoff:agent:bob')).toBe(0);
  });
});
