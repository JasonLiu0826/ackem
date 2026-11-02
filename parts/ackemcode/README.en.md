# AckemCode

[中文](README.md) · [Full kernel guide](../../docs/modules.md#ackemcode)

AckemCode is the general-purpose agent execution kernel embedded in Ackem. It provides a model/tool loop, sessions, permissions, plans, file and terminal tools, web/document tools, subagents, MCP, LSP, skills, plugins, CLI and Web UI.

Ackem supplies conversation, memory, personality and task coordination. This package can also run independently; it does not require Ackem's companion state.

```powershell
npm ci
npm run typecheck
npm run build
npm run cli
```

Run these commands from this package directory. `npm run dev:server` starts server development; `npm start` runs the compiled server. Model configuration and any external tools/services are required.

The service defaults to localhost port 8787. `ACKEMCODE_DATA_DIR` can select an absolute storage path. Host adapters may choose different defaults or reuse an existing daemon; confirm the actual process configuration.

Managed host sessions carry authority, revision and receipt metadata. Preserve these bindings when adding tools or clients. Working directories do not by themselves define global filesystem permissions.

See [integration, data and credentials](../../docs/modules.md#ackemcode), [routing/tasks](../../docs/architecture.md#tasks), and [source verification](../../docs/development.md#verification).
