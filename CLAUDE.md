# CLAUDE.md

## Tech stack

### Server (Go library)
Go 1.26 · Chi (routing) · Connect-Go (RPC) · `embed` for the SPA · urfave/cli/v3 (standalone command)

Module: `github.com/laenen-partners/dbosui`

### Web SPA
TypeScript 5 · Vite 6 · React 19 · Mantine 7 (`@mantine/core`, `form`, `hooks`, `modals`, `notifications`) + `mantine-react-table` · `@tabler/icons-react` · PostCSS + `postcss-preset-mantine` · `react-router-dom` v7 · `@tanstack/react-query` · Connect-Web (`@connectrpc/connect`, `@connectrpc/connect-web`) over Buf-generated protos (`@bufbuild/protobuf`).

Bundle output: single SPA, served by the Go binary from the embedded `web/dist/`.

## Commands (via mise)

- `mise run setup` — `go mod download` + `pnpm --dir web install`
- `mise run generate` — `buf generate` (regen Connect-Go + Connect-ES from `proto/`)
- `mise run web:dev` — Vite dev server with HMR; proxies `/api` to `:8080`
- `mise run web:build` — build SPA into `web/dist/`
- `mise run build` — build Go binary with SPA embedded (depends on `web:build`)
- `mise run run` — run admin UI against `$DATABASE_URL` / `$DBOS_POSTGRES_URL` from `.env`
- `mise run run:mock` — run with in-memory mock data
- `mise run format` / `lint` / `test`

Tool versions are pinned in `mise.toml`. Tasks are defined in `mise.yaml`.

## Project structure

```
proto/dbosui/v1/workflows.proto       — Connect service definition (source of truth)
proto/buf.yaml, proto/buf.gen.yaml    — Buf config; emits Go + TS code

gen/go/dbosui/v1/                     — Generated Go message + Connect handler/client stubs

web/                                  — SPA source
  index.html                          — has <base href="/" /> which is rewritten at serve time
  vite.config.ts                      — base: './' so assets resolve under any mount path
  src/main.tsx                        — Mantine, QueryClient, BrowserRouter providers
  src/App.tsx                         — AppShell + routes
  src/api/client.ts                   — Connect-Web transport (baseUrl derived from <base href>)
  src/api/queries.ts                  — React Query hooks (list, detail, stats, mutations)
  src/lib/format.ts                   — status enum maps, JSON pretty-print, timestamp helpers
  src/pages/WorkflowsPage.tsx         — list (mantine-react-table) + drawer trigger
  src/components/StatsBar.tsx         — top tiles
  src/components/WorkflowDetail.tsx   — detail drawer body + action buttons
  src/gen/dbosui/v1/workflows_pb.ts   — generated; Connect-ES v2 reads GenService from here
  dist/                               — vite build output, embedded by Go (kept .gitkeep'd)

client.go                             — Client interface + WorkflowInfo/StepInfo/EventInfo/MockClient
dbos_client.go                        — Real DBOS client (dbos.NewClient + pgxpool)
service.go                            — Connect-Go WorkflowService implementation
helpers.go                            — base64 decode for DBOS-stored values
dbosui.go                             — Config + Handler(): chi router, /api mount + SPA
embed.go                              — go:embed all:web/dist
cmd/dbosui/main.go                    — urfave/cli/v3 entrypoint (`dbosui serve`)
```

## How requests flow

1. SPA loads from `Handler()` at `cfg.BasePath` (default `/`). `index.html` is served with `<base href>` rewritten to the configured base path.
2. SPA derives the API URL from `document.baseURI` + `/api`. With Connect-Web that produces a POST against `…/api/dbosui.v1.WorkflowService/<Method>`.
3. Chi routes `/api/*` to `dbosuiv1connect.NewWorkflowServiceHandler(...)`.
4. `workflowService` (in `service.go`) implements `WorkflowServiceHandler` by delegating to the `Client` interface — same surface as before.
5. Mutations on the SPA invalidate React Query caches (`['workflows']`, `['stats']`, …) so the list and stats bar refresh automatically.

## Adding a new RPC

1. Add the message + RPC to `proto/dbosui/v1/workflows.proto`.
2. Run `mise run generate` — produces Go stubs in `gen/go/...` and TS in `web/src/gen/...`.
3. Implement the method in `service.go` (delegating to `Client` if it's a new backend capability — in which case add to the interface in `client.go`, `dbos_client.go`, and `mockClient`).
4. Add a React Query hook in `web/src/api/queries.ts`.
5. Use it in a component. Mutations should `notifications.show` on success/error and `qc.invalidateQueries` to refresh affected queries.

## Public API

The Go package exposes three levels of reuse so consumers can opt in to as much or as little of the bundled UI as they want:

1. **`Client` interface** (`client.go`) — the abstract data layer. Implement it for a custom backend, or use:
   - `dbosui.NewDBOSClient(ctx, dsn)` — backed by the official DBOS Go SDK + a `pgxpool`
   - `dbosui.MockClient()` — in-memory sample data
   A consumer who wants to build a completely different UI (CLI, TUI, custom HTML, another framework) can depend on just this — no HTTP, no Connect, no SPA.
2. **`APIHandler(client, opts...)`** (`dbosui.go`) — returns `(path, http.Handler)` for the Connect-Go `WorkflowService` only. Mount this in your own router if you want the wire API but ship your own frontend. The proto in `proto/dbosui/v1/workflows.proto` is the contract — generate clients for any language with `buf`.
3. **`Handler(Config)`** (`dbosui.go`) — full admin UI: API + embedded SPA. The default. `BasePath` is required when mounting under a prefix so the SPA's `<base href>`, React Router, and Connect transport all resolve correctly.

### Embedding the full UI

```go
r := chi.NewRouter()
r.Mount("/dbos", dbosui.Handler(dbosui.Config{
    Client:   myDBOSClient,
    BasePath: "/dbos",
}))
```

### Embedding the API only

```go
path, api := dbosui.APIHandler(myDBOSClient)
mux.Handle("/api"+path, http.StripPrefix("/api", api))
```

## DBOS system database

Same as before — schema `dbos`, key tables `workflow_status`, `operation_outputs`, `workflow_events`, `notifications`. Timestamps are epoch-ms (`BIGINT`), values are base64-encoded JSON. `dbos_client.go` mixes the official `dbos.Client` with a `pgxpool` for queries the SDK doesn't expose (substring `name` search, listing `workflow_events`).

`Input`/`Output` are passed to the SPA as raw strings (the field is `*_json` on the proto). The SPA in `lib/format.ts` tries base64-decode → JSON-parse → pretty-print at render time, falling back to the raw string.

## Rules

- **Wrap errors**: `fmt.Errorf("context: %w", err)`.
- **Edit `.proto` is the source of truth** — never hand-edit generated files in `gen/` or `web/src/gen/`. After `.proto` changes, run `mise run generate`.
- **No custom CSS** — use Mantine components and theme tokens. PostCSS is configured with `postcss-preset-mantine`.
- **Mantine v7 + react-router-dom v7** — both are pinned majors; bumps need a deliberate review.
- **Connect-ES v2** — service descriptors live in `workflows_pb.ts` (`GenService`). There is no separate `_connect.ts` file in this project; `createClient(WorkflowService, transport)` consumes the descriptor directly.
- **SPA build output must exist for `go build`**: `go:embed all:web/dist` requires at least `.gitkeep`. CI should run `pnpm --dir web build` before `go build` for a production binary.
