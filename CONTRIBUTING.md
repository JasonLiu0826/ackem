# Contributing

[中文](CONTRIBUTING.zh.md) · [Architecture](docs/architecture.md)

Contributions to fixes, documentation, accessibility, channels, tools, the kernel and extensions are welcome. Read current source and the Ackem / AckemCode boundary first.

## Understand execution

- Ackem owns conversation, memory, personality, chat / plugin / work routing and task coordination.
- AckemCode owns the general agent loop, tools, sessions, permissions and receipts.
- Managed tasks, independent work and QQ / WeChat code dispatch are distinct entry paths.
- The legacy desktop assistant is removed; new features must not depend on its IPC or executors.

[Overall architecture](docs/architecture.md) · [Routing and tasks](docs/architecture.md#tasks) · [Kernel](docs/modules.md#ackemcode)

## Develop and verify

Current CI uses Windows / Node.js 22. Install, check and build the app and kernel separately:

```powershell
npm ci
npm --prefix parts/ackemcode ci
npm --prefix parts/ackemcode run build
npm run dev
```

```powershell
npm run typecheck
npx tsc --noEmit -p tsconfig.node.json
npm --prefix parts/ackemcode run typecheck
npm run build
```

The app requires Electron preload; a standalone browser page is not runtime acceptance. The root build script uses Windows shell syntax; adapt for other environments. See [setup](docs/development.md#environment).

The public source does not distribute the full local test suite or promise a root `npm test` script. Run meaningful checks and disclose live-model, channel, native-module and platform limitations. Early exit or skipping is not a pass.

## Submit changes

External contributions normally use a branch and PR describing the problem, final behavior, validation and limitations. Authorized maintainers follow their collaboration agreement for routine work and small features/modules. Discuss major features, architecture or project direction first.

Keep changes focused. Update both document languages and affected routing, state, permissions or storage descriptions. App, kernel and extension API versions are distinct.

Never commit private data, kernel settings/sessions, credentials, logs, generated artifacts or machine-specific paths. Report vulnerabilities through [SECURITY](SECURITY.md).

## Extensions

Use existing capabilities through plugin routing; creation/modification uses work / AckemCode. Generated code must still satisfy Ackem registration, permission and loading contracts. Kernel plugins are not automatically Ackem extensions.

Local `u/` prototypes and built-in `ackem/` contributions are supported. The `community/` marketplace remains closed.

[Extension protocol](docs/development.md#extensions) · [OpenForU](src/main/extensions/openforu/PROTOCOL.md)

## License and conduct

Follow [LICENSE](LICENSE), [CLA](CLA.md) and the [Code of Conduct](CODE_OF_CONDUCT.md). Preserve third-party attribution and licensing.
