import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer } from 'ws';
import type { Hub } from './realtime.ts';

/** Accepts WebSocket upgrades on /v1/realtime?ticket=... and hands sockets to the hub. */
export function attachRealtime(server: Server, hub: Hub): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname !== '/v1/realtime') {
      socket.destroy();
      return;
    }
    const principalId = hub.redeemTicket(url.searchParams.get('ticket') ?? '');
    if (!principalId) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      hub.connect(principalId, ws);
      // Pings keep mobile connections from being dropped by proxies.
      ws.on('message', (data) => {
        try {
          if ((JSON.parse(String(data)) as { type?: string }).type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
        } catch {
          // Ignore anything that is not JSON.
        }
      });
      const drop = () => hub.disconnect(principalId, ws);
      ws.on('close', drop);
      ws.on('error', drop);
    });
  });
  return wss;
}
