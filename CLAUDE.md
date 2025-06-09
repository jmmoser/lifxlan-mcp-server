# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

**Install dependencies:**
```bash
bun install
```

**Run the server:**
```bash
bun run index.ts
```

**Development server with port override:**
```bash
PORT=3001 bun run index.ts
```

## Architecture Overview

This is an MCP (**Model Context Protocol**) server that provides tools for controlling LIFX smart lights over the local network. The server exposes LIFX device control capabilities through the MCP protocol.

### Key Components

1. **MCP Server** (`index.ts`):
   - Express.js HTTP server handling MCP protocol over HTTP
   - Uses `StreamableHTTPServerTransport` for MCP communication
   - Manages multiple client sessions with session ID tracking
   - Supports session resumability with event store
   - Handles POST (commands), GET (SSE streams), and DELETE (termination)

2. **LIFX Integration** (`tools.ts`):
   - See ./docs/lifxlan.md for documentation on how to use the lifxlan package. If there is any ambiguity in how to use it, stop, explain what is ambiguous and ask me to clarify how to use it.
   - **Currently incomplete** - missing MCP tool implementations
   - Contains LIFX device discovery via UDP broadcast
   - Uses `lifxlan` library for LIFX LAN protocol communication
   - Device registry tracks discovered lights on the network
   - Should contain `createServer()` function and MCP tool handlers

### Network Architecture

- **LIFX Communication**: UDP broadcasts on port 56700 for device discovery
- **MCP Communication**: HTTP server (default port 3001) with session management
- **Transport Protocol**: StreamableHTTP with SSE for real-time updates

### Session Management

The server maintains a `Map<string, StreamableHTTPServerTransport>` to track active MCP sessions. Each session gets a unique ID and can be resumed using the event store pattern.

### Missing Implementation

The `tools.ts` file needs completion with:
- `createServer()` function that returns an MCP server instance
- MCP tool definitions for LIFX operations (device listing, light control, color changes)
- Proper integration between LIFX device discovery and MCP tool execution

## Dependencies

- **Runtime**: Bun (fast JavaScript runtime)
- **MCP SDK**: `@modelcontextprotocol/sdk` for protocol implementation
- **LIFX Control**: `lifxlan` library for smart light communication
- **HTTP Server**: Express.js for web endpoints