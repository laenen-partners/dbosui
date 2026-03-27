# CLAUDE.md

## Tech stack

Go + Chi (routing) + Templ (templating) + Tailwind CSS + DaisyUI (styling) + Datastar (frontend interactivity)

Module: `github.com/laenen-partners/dbosui`

Built on the [dsx](https://github.com/laenen-partners/dsx) component framework (`github.com/laenen-partners/dsx`).

## Commands

- `task run` — run the admin UI (reads `.env` for `DBOS_POSTGRES_URL`)
- `task run:mock` — run with mock data (no database)
- `task build` — build binary to `bin/dbosui`
- `task generate` — generate Go code from `.templ` files
- `task format` — format Go + templ files
- `task lint` — lint Go code
- `task test` — run tests
- `task live` — live reload (templ watch + air)

## Project structure

```
client.go           — Client interface, types (WorkflowInfo, StepInfo, EventInfo, etc.), MockClient
dbos_client.go      — Real DBOS client (dbos.NewClient + pgxpool for direct SQL)
dbosui.go           — Public API: Handler() (embeddable) and Run() (standalone showcase)
handlers.go         — HTTP handlers: list, stats, detail, steps, cancel, resume
helpers.go          — Formatting helpers (time, JSON pretty-print, base64 decode)
page.templ          — Page templates: ShowcasePage, AdminPage, workflowsContent
fragments.templ     — SSE fragment components: StatsBar, WorkflowTableBody, DetailContent, etc.
cmd/dbosui/main.go  — CLI entry point with .env loading and flags
```

## How the UI works

This project uses the dsx framework's patterns. Key concepts:

1. **SSE fragments**: Handlers return HTML fragments via `ds.Send.Patch(sse, component)`. The browser's Datastar runtime patches the DOM.
2. **Signals**: Client-side state managed by Datastar signals (e.g. `wf_filter` namespace with status, name, page, refresh).
3. **Drawer**: Workflow details open in a slide-in drawer via `ds.Send.Drawer(sse, component)`. An expand icon toggles full-width via CSS class toggle.
4. **Auto-refresh**: Uses `data-effect` to set up `setInterval` that clicks a hidden refresh button.

## Datastar attribute syntax (Datastar v1.0.0-RC.7)

**Critical**: This project uses Datastar RC.7 which has specific syntax rules:

- **Colon notation**: `data-on:click`, `data-bind:ns.field`, `data-show`
- **Modifier separator**: Double underscore `__`, NOT dot. Example: `data-on:input__debounce.300ms`
- **Modifier values**: Dot-separated after modifier name. Example: `__throttle.500ms`
- **Actions**: `@get('/url')`, `@post('/url')` — POST auto-includes CSRF token
- **Signal references**: `$namespace.field` (e.g. `$wf_filter.status`)
- **Multiple statements**: Semicolon-separated: `$wf_filter.page = 0; @get('/url')`

Use dsx helpers instead of raw attributes:
```go
ds.On("click", expr)                    // data-on:click="expr"
ds.On("input__debounce.300ms", expr)    // data-on:input__debounce.300ms="expr"
ds.Bind("wf_filter", "status")         // data-bind:wf_filter.status
ds.Show(expr)                           // data-show="expr"
ds.Init(ds.Get(url))                    // data-init="@get('/url')"
ds.Effect(expr)                         // data-effect="expr"
ds.OnClick(expr)                        // data-on:click="expr"
```

## Signal reading in handlers

`ds.ReadSignals` reads signals from both GET (`?datastar=` query param) and POST (request body). **Must be called before `datastar.NewSSE(w, r)`** — SSE creation consumes the body.

```go
func (h *workflowHandlers) list() http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        var signals filterSignals
        _ = ds.ReadSignals("wf_filter", r, &signals) // before NewSSE!
        // ... build filter from signals ...
        sse := datastar.NewSSE(w, r)
        _ = ds.Send.Patch(sse, WorkflowTableBody(result.Workflows, ...))
    }
}
```

## DBOS system database

The DBOS system database uses schema `dbos` with these key tables:

- `dbos.workflow_status` — main workflow table (workflow_uuid, status, name, created_at as epoch ms, etc.)
- `dbos.operation_outputs` — step outputs (workflow_uuid, function_id, function_name, output, error)
- `dbos.workflow_events` — events set via `dbos.SetEvent` (workflow_uuid, key, value)
- `dbos.notifications` — signals sent via `dbos.Send` (destination_uuid, topic, message)

**Timestamps** are stored as `BIGINT` epoch milliseconds, not `TIMESTAMP`. Convert with `time.UnixMilli(ms)`.

**Values** (input, output, events) are stored as base64-encoded JSON strings. Decode with `base64.StdEncoding.DecodeString` then `json.Unmarshal`.

The `DBOSClient` uses:
- `dbos.Client` (official SDK) for standard operations (list, cancel, resume, get steps)
- `pgxpool.Pool` (direct SQL) for queries the SDK doesn't support (name substring search with ILIKE, listing workflow_events)

## Rules

- **Wrap errors**: `fmt.Errorf("context: %w", err)`
- **No custom CSS/JS** — use DaisyUI classes + Datastar only
- **Use theme tokens** — no hardcoded colours
- **Run `go tool templ fmt` then `go tool templ generate`** after editing `.templ` files, before committing
- **Drawer expand** uses pure CSS class toggle (`max-w-lg` ↔ `max-w-full`) via JS on the drawer panel element — no server round-trip
- **DBOS SDK `WithName` does exact match** — for substring name search, query the DB directly with `ILIKE`
- **dsx patterns**: follow the dsx showcase patterns for handlers (SSE patch), forms (form.Handler), and reactive updates (stream.Watch)

## Key types

```go
// Client interface — implement for custom backends
type Client interface {
    ListWorkflows(ctx context.Context, filter ListFilter) (*ListResult, error)
    GetWorkflow(ctx context.Context, id string) (*WorkflowInfo, error)
    GetWorkflowSteps(ctx context.Context, id string) ([]StepInfo, error)
    GetWorkflowEvents(ctx context.Context, id string) ([]EventInfo, error)
    CancelWorkflow(ctx context.Context, id string) error
    ResumeWorkflow(ctx context.Context, id string) error
}

// filterSignals — Datastar signals for the workflow filter form
type filterSignals struct {
    Status  string `json:"status"`
    Name    string `json:"name"`
    Page    int    `json:"page"`
    Refresh int    `json:"refresh"` // auto-refresh interval in ms, 0=off
}
```

## Adding new features

1. Add types to `client.go` if needed
2. Implement the backend in `dbos_client.go` (and `MockClient` for testing)
3. Add HTTP handler in `handlers.go`
4. Register route in `dbosui.go` (both `Handler()` and `Run()` paths)
5. Add templ component in `fragments.templ` (SSE fragment) or `page.templ` (page-level)
6. Run `go tool templ generate` and `go build ./...`
