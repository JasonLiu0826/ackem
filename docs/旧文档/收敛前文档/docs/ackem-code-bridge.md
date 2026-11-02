> 历史归档（六类收敛前）：保留当时说明，仅供追溯；当前入口见[文档导航](../../../README.md)。

# QQ / WeChat integration with AckemCode

[中文](ackem-code-bridge.zh.md) · [Kernel guide](ackemcode-kernel.md)

Desktop and channels use the same kernel through different host adapters. This page describes channel code dispatch; see [routing and tasks](developer/architecture/09-routing-and-tasks.md) for desktop work.

## Current path

```mermaid
flowchart TB
    accTitle: Remote Channel Dispatch Decision Flow
    accDescr: Confirmed channel ownership precedes dispatch. Image turns skip the code bridge. Authorized matching requests use the kernel; other turns continue conversation.

    channel_request(["QQ / WeChat request"])
    owner_gate["Confirmed channel owner"]
    bridge_gate{"No user images<br/>Remote dispatch enabled"}
    intent_match{"Explicit /code or rule match"}
    bridge_session["Channel session adapter"]
    runtime_kernel[["AckemCode execution"]]
    channel_reply(["Reply to requesting channel"])
    companion_chat["Continue channel conversation"]

    channel_request --> owner_gate
    owner_gate --> bridge_gate
    bridge_gate -->|"Yes"| intent_match
    bridge_gate -->|"Skip bridge"| companion_chat
    intent_match -->|"Matched"| bridge_session
    intent_match -->|"Unmatched"| companion_chat
    bridge_session --> runtime_kernel
    runtime_kernel --> channel_reply

    classDef neutral fill:#f3f4f6,stroke:#6b7280,stroke-width:1.4px,color:#1f2937
    classDef primary fill:#dbeafe,stroke:#2563eb,stroke-width:1.6px,color:#1e3a5f
    classDef accent fill:#ede9fe,stroke:#7c3aed,stroke-width:1.6px,color:#3b0764
    classDef success fill:#dcfce7,stroke:#16a34a,stroke-width:1.6px,color:#14532d
    class channel_request,companion_chat neutral
    class owner_gate,bridge_gate,intent_match,bridge_session primary
    class runtime_kernel accent
    class channel_reply success
```

Turns containing user images skip this code-dispatch check. Desktop chat uses orchestrateChannelTurn and managed task coordination instead.

| Source | Responsibility |
|---|---|
| [companionTurn.ts](../../../../src/main/channels/companionTurn.ts) | Channel turn and dispatch |
| [dispatch.ts](../../../../src/main/ackemcode/dispatch.ts) | Settings, intent, permissions and result |
| [intent.ts](../../../../src/main/ackemcode/intent.ts) | Explicit prefixes and engineering rules |
| [index.ts](../../../../src/main/ackemcode/index.ts) | Runtime readiness and session mapping |
| [chatClient.ts](../../../../src/main/ackemcode/chatClient.ts) | Channel HTTP / SSE client |
| [daemon.ts](../../../../src/main/ackemcode/daemon.ts) | Built-server startup and reuse |
| [llmSync.ts](../../../../src/main/ackemcode/llmSync.ts) | App model configuration sync |

## Usage

Confirm the channel owner under **Settings → Mobile**, then enable remote dispatch under **Settings → Work execution**. `workRemoteChannelsEnabled` defaults off. Old `desktopAgentRemoteChannelsEnabled` grants migrate; an explicit new value takes precedence.

Prefixes include `/code`, `#code`, `代码：` and `code:`. Automatic detection still uses action words and engineering/technical context, rather than the desktop general semantic classifier. Companion writing and questions without delegation are excluded by the rules.

| Variable | Scope in this adapter |
|---|---|
| `ACKEMCODE_DISABLE=1` | Disable this code bridge, not all desktop work |
| `ACKEMCODE_REQUIRE_EXPLICIT=1` | Require an explicit code prefix here |
| `ACKEMCODE_PERMISSION_MODE` | Remote permission priority: environment > setting > bypassPermissions |
| `ACKEMCODE_URL` / `ACKEMCODE_PORT` | Service address / port |
| `ACKEMCODE_DATA_DIR` | Kernel storage override |

Session reuse checks the directory and permission mode; a changed mode creates a new session. Tightening permissions does not undo operations already performed. Confirm stopping separately for running work.

## Sessions and storage

Channel mapping uses `ackemcode-sessions.json` in Electron userData. The bridge defaults kernel data to `~/.ackemcode/`; a reused service uses its actual startup data directory.

Replies return to the requesting channel. Shared desktop history can show their source. This direct code-turn path differs from desktop contracts, supervision, acceptance and notification delivery.

Disabled dispatch, unmatched intent or a missing built runtime returns unhandled and continues ordinary conversation. Execution failure after dispatch is a failed result.

## Acceptance checks

1. Remote dispatch cannot execute through this bridge while disabled.
2. Unconfirmed owners cannot enter the authorized channel flow.
3. With authorization, send an explicit read-only `/code` request and inspect actual tool output.
4. Check source markers in desktop history and no mirrored reply on the other messaging channel.
5. Change permission mode and inspect actual session/approval behavior.

The public source does not include a complete runnable bridge test suite. Live channel checks require local services and credentials.

The old desktop assistant is removed. New integration must use AckemCode rather than restoring its old switch, IPC or `use_computer`. See [kernel setup and storage](ackemcode-kernel.md).
