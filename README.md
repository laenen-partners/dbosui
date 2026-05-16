# dbosui

Admin UI for [DBOS](https://dbos.dev) workflows. A Go library that exposes a [Connect-Go](https://connectrpc.com/) RPC API and an embedded React + Mantine SPA, plus a standalone `dbosui serve` command.

Browse, filter, inspect, cancel, resume, and delete DBOS workflow executions from a web dashboard. Connects to the DBOS system database via the official Go client and direct SQL.

![overview](./docs/ui-overview.png)
![detail](./docs/ui-detail.png)
![detail-expanded](./docs/ui-detail-expanded.png)

## Features

- **Workflow list** with status filter, substring name search, server-side pagination & sorting (`mantine-react-table`)
- **Stats bar** — total / pending / success / failed / cancelled
- **Detail drawer** — metadata, input/output JSON, execution steps, and `dbos.SetEvent` events
- **Actions** — cancel, resume, delete (with confirm modals + toast notifications)
- **Base64 decoding** of DBOS-encoded values, displayed as pretty-printed JSON
- **Two deployment modes** — standalone binary or embeddable `http.Handler`
- **Three reuse levels** — `Client` interface, Connect API only, or full UI

## Stack

| Layer            | Choice                                                                                |
| ---------------- | ------------------------------------------------------------------------------------- |
| Server (lib)     | Go 1.26 · Chi · Connect-Go · `embed`                                                  |
| Standalone CLI   | `urfave/cli/v3`                                                                       |
| Wire format      | Connect (Protobuf over HTTP) — schema in `proto/dbosui/v1/workflows.proto`            |
| Web framework    | React 19 · TypeScript 5 · Vite 6                                                      |
| UI components    | Mantine 7 (`core`, `form`, `hooks`, `modals`, `notifications`) + `mantine-react-table` |
| Icons            | `@tabler/icons-react`                                                                 |
| Routing          | `react-router-dom` v7                                                                 |
| Server cache     | `@tanstack/react-query`                                                               |
| Transport        | Connect-Web (`@connectrpc/connect`, `@connectrpc/connect-web`) + `@bufbuild/protobuf` |

## Quick start

### Prerequisites

- [Go 1.26+](https://go.dev/dl/)
- [Node 22+](https://nodejs.org) and [pnpm](https://pnpm.io)
- [Buf](https://buf.build) (only needed when regenerating from `.proto`)
- [mise](https://mise.jdx.dev/) — recommended, pins all of the above

### Setup

```bash
mise install            # install Go, Node, pnpm, buf
mise run setup          # go mod download + pnpm install in web/
cp .env.example .env    # configure database URL
```

Edit `.env`:

```
DATABASE_URL=postgresql://user:password@localhost:5432/mydb?sslmode=disable
# DBOS_POSTGRES_URL is also recognised
```

### Run

```bash
# Real DBOS database
mise run run

# Mock data (no database)
mise run run:mock

# Build a release binary (SPA embedded)
mise run build
./bin/dbosui serve --port 8080
```

The UI is available at `http://localhost:8080`.

### Develop

Frontend HMR + Go backend on the same port:

```bash
# Terminal 1: Go API with mock data on :8080
mise run run:mock

# Terminal 2: Vite dev server on :5173 (proxies /api → :8080)
mise run web:dev
```

Open http://localhost:5173.

Other tasks:

```bash
mise run generate       # regen Connect-Go + Connect-ES from proto/
mise run web:build      # build SPA into web/dist (required for go build)
mise run format         # gofumpt
mise run lint           # golangci-lint
mise run test           # go test ./...
```

## Embedding in your application

The library offers three levels of reuse:

### 1. Full UI (API + SPA)

```go
import "github.com/laenen-partners/dbosui"

client, _ := dbosui.NewDBOSClient(ctx, "postgresql://...")
defer client.Shutdown(5 * time.Second)

r := chi.NewRouter()
r.Mount("/admin", dbosui.Handler(dbosui.Config{
    Client:   client,
    BasePath: "/admin",
}))
```

`BasePath` is required when mounting under a prefix — it is injected into the SPA's `<base href>` so router and asset URLs resolve correctly.

### 2. Connect API only (bring your own UI)

```go
path, api := dbosui.APIHandler(client)
mux.Handle("/api"+path, http.StripPrefix("/api", api))
```

The wire format is the same Connect service the bundled SPA uses. Generate clients in any language with `buf` against `proto/dbosui/v1/workflows.proto`.

### 3. `Client` interface only (no HTTP)

```go
type Client interface {
    ListWorkflows(ctx context.Context, filter ListFilter) (*ListResult, error)
    GetWorkflow(ctx context.Context, id string) (*WorkflowInfo, error)
    GetWorkflowSteps(ctx context.Context, id string) ([]StepInfo, error)
    GetWorkflowEvents(ctx context.Context, id string) ([]EventInfo, error)
    CancelWorkflow(ctx context.Context, id string) error
    ResumeWorkflow(ctx context.Context, id string) error
    DeleteWorkflow(ctx context.Context, id string) error
}
```

Use `dbosui.NewDBOSClient(ctx, dsn)` for the real backend, `dbosui.MockClient()` for tests, or implement it against a custom data source (sqlc, DBOS Cloud API, etc.) and consume directly — no HTTP, no Connect, no SPA required.

### Gin example

```go
h := dbosui.Handler(dbosui.Config{Client: client, BasePath: "/admin"})
ginRouter.Any("/admin/*path", gin.WrapH(h))
```

## Architecture

```
proto/dbosui/v1/workflows.proto    Connect service definition (source of truth)
proto/buf.{yaml,gen.yaml}          Buf config; emits Go + TS

gen/go/dbosui/v1/                  Generated Go message + Connect handler/client stubs

client.go                          Client interface, WorkflowInfo/StepInfo/EventInfo, MockClient
dbos_client.go                     Real DBOS client (dbos.NewClient + pgxpool)
service.go                         Connect-Go WorkflowService backed by Client
dbosui.go                          Config, Handler() (API + SPA), APIHandler() (API only)
embed.go                           go:embed all:web/dist
helpers.go                         base64 decode for DBOS-stored values
cmd/dbosui/main.go                 urfave/cli/v3 entrypoint (dbosui serve …)

web/                               React SPA
├── index.html                     <base href> rewritten at serve time
├── vite.config.ts                 base: './' so assets work under any mount path
├── src/api/{client,queries}.ts    Connect-Web transport + React Query hooks
├── src/lib/format.ts              status enum maps, JSON pretty-print, timestamps
├── src/pages/WorkflowsPage.tsx    list (mantine-react-table) + drawer trigger
├── src/components/                StatsBar, WorkflowDetail
├── src/gen/dbosui/v1/             generated (Connect-ES v2)
└── dist/                          vite build output (embedded by Go)
```

### Request flow

1. SPA loads from `Handler()` at `cfg.BasePath`. `index.html` is served with `<base href>` rewritten to the configured base path.
2. SPA derives the API URL from `document.baseURI` + `/api`. Connect-Web posts to `…/api/dbosui.v1.WorkflowService/<Method>`.
3. Chi routes `/api/*` to the Connect-Go handler.
4. `workflowService` (in `service.go`) implements `WorkflowServiceHandler` by delegating to the `Client` interface.
5. Mutations on the SPA invalidate the relevant React Query caches so the list and stats bar refresh automatically.

### DBOS connection

`DBOSClient` mixes two sources:

- **`dbos.Client`** (official Go SDK) for `ListWorkflows`, `GetWorkflowSteps`, `CancelWorkflow`, `ResumeWorkflow`
- **`pgxpool.Pool`** (direct SQL) for substring name search (`ILIKE`), distinct-name lookup, `workflow_events`, total-count queries, and `DELETE`

Both share the same `SystemDBPool`. Input/output values are stored as base64-encoded JSON by DBOS; they're forwarded raw to the SPA, which decodes and pretty-prints in `src/lib/format.ts`.

#### Recommended indexes

The UI uses offset-based pagination plus a separate `COUNT(*)` for every list call. Both queries filter by `status`, `authenticated_user`, or `workflow_uuid LIKE …` and order by `created_at`. On large workflow tables, add a supporting index in the DBOS system DB:

```sql
CREATE INDEX IF NOT EXISTS workflow_status_status_created_at_idx
  ON dbos.workflow_status (status, created_at DESC);

CREATE INDEX IF NOT EXISTS workflow_status_name_lower_idx
  ON dbos.workflow_status (LOWER(name));
```

The first keeps the filtered list and its count cheap; the second backs the case-insensitive substring search on `name`. The standard DBOS schema indexes `workflow_uuid` already.

## Configuration

| Environment variable                | Description                                  | Default                |
| ----------------------------------- | -------------------------------------------- | ---------------------- |
| `DATABASE_URL` / `DBOS_POSTGRES_URL` | Postgres connection string for the DBOS sys DB | (required unless `--mock`) |
| `PORT`                              | HTTP server port                             | `8080`                 |

CLI flags (`dbosui serve --help`):

| Flag             | Description                                                |
| ---------------- | ---------------------------------------------------------- |
| `--port` / `-p`  | TCP port to listen on (env `PORT`)                         |
| `--database-url` | Postgres URL (env `DATABASE_URL` / `DBOS_POSTGRES_URL`)    |
| `--base-path`    | URL prefix the UI is served under (default `/`)            |
| `--mock`         | Serve mock data instead of connecting to a database        |
| `--env-file`     | Path to a `.env` file to load (default `.env`)             |

## Releasing

Releases are cut by the **Release** workflow in `.github/workflows/release.yml`. Trigger it from the GitHub Actions UI with a version like `v1.2.3`. The workflow:

1. Validates the tag is well-formed and doesn't already exist
2. Installs deps and builds the SPA (`web/dist/`)
3. Runs `go vet`, `go test`, and `pnpm typecheck`
4. Creates a **detached** commit that force-adds `web/dist/` (so `go get` consumers can embed the SPA without pnpm) — `main` is never updated, only the tag points to this commit
5. Cross-compiles binaries for linux/darwin/windows × amd64/arm64
6. Publishes a GitHub Release with the binaries and `checksums.txt`

After the tag is pushed, `go get github.com/laenen-partners/dbosui@vX.Y.Z` is immediately available via the Go module proxy.

`main` stays clean of build artifacts throughout — `web/dist/*` remains gitignored.

## License

See [LICENSE](LICENSE) for details.
