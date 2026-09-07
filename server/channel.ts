// Stdio MCP channel server — bridges browser user events to Claude Code context.
//
// Claude Code spawns this as a subprocess. It also listens on CHANNEL_PORT (default 3001)
// so the main HTTP server can forward browser events to it via POST /user-done.
//
// Start via: claude --dangerously-load-development-channels server:agent-whiteboard-channel
// (requires the entry in .mcp.json below to be present)

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createServer } from 'node:http'

const CHANNEL_PORT = Number(process.env.CHANNEL_PORT ?? 3001)

// notifications/claude/channel is a Claude-proprietary extension not in the MCP schema,
// so the SDK's Server type has no method for it — this describes the one extra method
// actually needed instead of casting to `any`.
interface NotifiableServer {
  notification(notification: { method: string; params: unknown }): Promise<void>
}

const mcp = new Server(
  { name: 'agent-whiteboard-channel', version: '0.1.0' },
  {
    capabilities: {
      // Declares this server as a Claude Code channel.
      // assertNotificationCapability() has no case for this method and passes silently.
      experimental: { 'claude/channel': {} },
    },
  }
)

await mcp.connect(new StdioServerTransport())

// Tiny HTTP relay: main server POSTs here when the browser fires a user event.
const relay = createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/user-done') {
    ;(mcp as unknown as NotifiableServer).notification({
      method: 'notifications/claude/channel',
      params: {
        content: 'User has finished exploring the whiteboard and is ready for you to continue.',
        meta: { event: 'user_done' },
      },
    }).catch((err) => {
      console.error('[agent-whiteboard-channel] notification failed:', err)
    })

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
  } else {
    res.writeHead(404)
    res.end()
  }
})

relay.listen(CHANNEL_PORT, '127.0.0.1', () => {
  process.stderr.write(`[agent-whiteboard-channel] relay on 127.0.0.1:${CHANNEL_PORT}\n`)
})
