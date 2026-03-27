# dbosui

Admin UI for [DBOS](https://dbos.dev) workflows, built with the [dsx](https://github.com/laenen-partners/dsx) component framework.

Browse, filter, inspect, and manage DBOS workflow executions from a web dashboard. Connects to the DBOS system database via the official Go client or direct SQL queries.

## Features

- **Workflow list** with status filtering, name search (substring, debounced), and pagination
- **Stats bar** showing total, pending, success, failed, and cancelled counts
- **Detail drawer** with full workflow metadata, input/output JSON, execution steps, and events (`dbos.SetEvent` data)
- **Expand drawer** to full-page width via icon toggle
- **Auto-refresh** with configurable interval (1s / 5s / 10s / 30s / 1min)
- **Cancel and resume** workflow actions
- **Base64 decoding** of DBOS-encoded values (input, output, events)
- **Two deployment modes**: standalone command or embeddable handler

## Quick start

### Prerequisites

- [Go 1.26+](https://go.dev/dl/)
- [mise](https://mise.jdx.dev/) (optional, manages tool versions)
- [Task](https://taskfile.dev/) (task runner)
- A running DBOS application with a PostgreSQL system database

### Setup

```bash
mise install          # install tool versions (optional)
task setup            # download Go dependencies
cp .env.example .env  # configure database URL
```

Edit `.env` and set your DBOS database URL:

```
DBOS_POSTGRES_URL=postgresql://user:password@localhost:5432/mydb?sslmode=disable
```

### Run

```bash
# With real DBOS database
task run

# With mock data (no database needed)
task run:mock

# Directly with go run
go run ./cmd/dbosui --port 8080

# Build binary
task build
./bin/dbosui --port 8080
```

The UI is available at `http://localhost:8080` (or the configured port).

### Development

```bash
task live              # live reload with templ watch + air
task format            # format Go + templ files
task lint              # run golangci-lint
task test              # run tests
```

## Embedding in your application

The admin UI can be mounted as a handler in an existing application.

### Chi

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

### Gin

```go
import "github.com/laenen-partners/dbosui"

h := dbosui.Handler(dbosui.Config{
    Client:   client,
    BasePath: "/admin",
})
ginRouter.Any("/admin/*path", gin.WrapH(h))
```

### Custom client

Implement the `Client` interface to use a custom data source (e.g. sqlc, DBOS Cloud API):

```go
type Client interface {
    ListWorkflows(ctx context.Context, filter ListFilter) (*ListResult, error)
    GetWorkflow(ctx context.Context, id string) (*WorkflowInfo, error)
    GetWorkflowSteps(ctx context.Context, id string) ([]StepInfo, error)
    GetWorkflowEvents(ctx context.Context, id string) ([]EventInfo, error)
    CancelWorkflow(ctx context.Context, id string) error
    ResumeWorkflow(ctx context.Context, id string) error
}
```

## Architecture

```
dbosui/
├── client.go           Client interface, types, MockClient
├── dbos_client.go      DBOS Go client + pgxpool implementation
├── dbosui.go           Handler() and Run() entry points
├── handlers.go         HTTP handlers (list, stats, detail, steps, cancel, resume)
├── helpers.go          Formatting (time, JSON, base64 decode)
├── page.templ          Page layouts (showcase + standalone)
├── fragments.templ     SSE fragment components (table, stats, detail, pagination)
├── cmd/dbosui/
│   └── main.go         CLI entry point (.env loading, flags)
├── Taskfile.yaml       Build/dev tasks
├── mise.toml           Tool versions
└── .env.example        Environment config template
```

### How it works

The UI uses [dsx](https://github.com/laenen-partners/dsx) which is built on:

- **[Chi](https://github.com/go-chi/chi)** for HTTP routing
- **[Templ](https://templ.guide)** for type-safe HTML templates
- **[Datastar](https://data-star.dev)** for reactive frontend (SSE-driven, no JavaScript framework)
- **[DaisyUI](https://daisyui.com)** + Tailwind CSS for styling

Page loads trigger `@get` calls via Datastar, which hit Go handlers that return SSE patches. The handlers query DBOS via the `Client` interface and render templ components as HTML fragments.

### Data flow

1. Browser loads page with Datastar signals and `data-init` triggers
2. Datastar sends `@get` requests with signals as `?datastar=` query param
3. Go handler reads signals via `ds.ReadSignals`, queries DBOS, renders templ component
4. Handler responds with SSE `datastar-patch-elements` event
5. Datastar patches the DOM with the HTML fragment
6. Filter changes (status dropdown, name input) update signals and re-trigger `@get`
7. Auto-refresh uses `setInterval` to periodically click a hidden refresh trigger

### DBOS connection

The `DBOSClient` uses two connections:

- **`dbos.Client`** (official Go SDK) for `ListWorkflows`, `GetWorkflowSteps`, `CancelWorkflow`, `ResumeWorkflow`
- **`pgxpool.Pool`** (direct SQL) for name substring search (`ILIKE`) and `workflow_events` queries that the SDK doesn't expose

Both share the same connection pool via `ClientConfig.SystemDBPool`.

## Configuration

| Environment variable | Description | Default |
|---|---|---|
| `DBOS_POSTGRES_URL` | PostgreSQL connection string for the DBOS system database | (required unless `--mock`) |
| `PORT` | HTTP server port | `8080` |

CLI flags:

| Flag | Description |
|---|---|
| `--port` | HTTP server port (overridden by `PORT` env var) |
| `--mock` | Use mock data instead of a real database |

## License

See [LICENSE](LICENSE) for details.
