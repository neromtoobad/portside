// The testnet's wss endpoint drops large responses (metadata), but its HTTPS JSON-RPC is fine.
// This relays websocket JSON-RPC to HTTPS so Chopsticks can fork the chain. Subscriptions are not needed.
// The upstream sometimes answers with an HTML error page under load, so retry and never forward non-JSON.
import { WebSocketServer } from 'ws';

const target = process.env.RELAY_TARGET ?? 'https://test-node-v3.portaldot.dev';
const port = Number(process.env.RELAY_PORT ?? 9944);
const log = Boolean(process.env.RELAY_LOG);

async function forward(req) {
  let last = '';
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(target, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(req) });
      const body = await res.text();
      if (body.startsWith('{') || body.startsWith('[')) return body;
      last = `HTTP ${res.status}: ${body.slice(0, 80)}`;
    } catch (e) {
      last = String(e);
    }
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
  }
  return JSON.stringify({ jsonrpc: '2.0', id: req.id, error: { code: -32000, message: `relay: ${last}` } });
}

new WebSocketServer({ port }).on('connection', (socket) => {
  socket.on('message', async (raw) => {
    const req = JSON.parse(raw.toString());
    const t0 = Date.now();
    const body = await forward(req);
    socket.send(body);
    if (log) console.log(req.method, Date.now() - t0, 'ms', body.length, 'bytes');
  });
});
console.log(`relay ws://127.0.0.1:${port} -> ${target}`);
