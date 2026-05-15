// Package dbosui exposes an embeddable admin UI for DBOS workflows.
// It is composed of a Connect-Go API (under /api/) and a React SPA served
// from an embedded build of web/dist.
package dbosui

import (
	"io/fs"
	"net/http"
	"path"
	"strings"

	"connectrpc.com/connect"
	"github.com/go-chi/chi/v5"

	"github.com/laenen-partners/dbosui/gen/go/dbosui/v1/dbosuiv1connect"
)

// Config configures the DBOS admin UI handler.
type Config struct {
	// Client provides access to DBOS workflow data.
	Client Client

	// BasePath is the URL prefix the handler is mounted under (e.g. "/dbos").
	// The SPA uses it for its <base href> so router and asset URLs resolve
	// correctly when embedded in a host application.
	// Default: "/".
	BasePath string

	// ConnectOptions are passed through to the Connect-Go handler.
	ConnectOptions []connect.HandlerOption
}

func (c *Config) defaults() {
	if c.BasePath == "" {
		c.BasePath = "/"
	}
	if !strings.HasPrefix(c.BasePath, "/") {
		c.BasePath = "/" + c.BasePath
	}
	if !strings.HasSuffix(c.BasePath, "/") {
		c.BasePath += "/"
	}
}

// Handler returns an http.Handler serving the DBOS admin UI.
//
// Mount it under a prefix in your router:
//
//	r.Mount("/dbos", dbosui.Handler(dbosui.Config{Client: c, BasePath: "/dbos"}))
//
// The handler exposes:
//   - /api/dbosui.v1.WorkflowService/* — Connect-Go RPCs
//   - /*                                — embedded SPA (with SPA fallback)
//
// If you want the API without the bundled SPA (to build your own frontend
// against the same Connect service) use APIHandler instead.
func Handler(cfg Config) http.Handler {
	cfg.defaults()

	r := chi.NewRouter()

	apiPath, apiHandler := APIHandler(cfg.Client, cfg.ConnectOptions...)
	// apiPath is "/dbosui.v1.WorkflowService/" — mount it under /api so the SPA
	// can call relative URLs like "api/dbosui.v1.WorkflowService/ListWorkflows".
	r.Mount("/api"+apiPath, http.StripPrefix("/api", apiHandler))

	r.Handle("/*", spaHandler(cfg.BasePath))

	return r
}

// APIHandler returns the Connect-Go RPC handler for the WorkflowService
// without the bundled SPA. The first return value is the path prefix the
// handler expects to be mounted at (e.g. "/dbosui.v1.WorkflowService/").
//
// Use this when you want to expose the same RPC API but ship your own UI.
//
//	path, h := dbosui.APIHandler(myClient)
//	mux.Handle(path, h)
func APIHandler(c Client, opts ...connect.HandlerOption) (string, http.Handler) {
	return dbosuiv1connect.NewWorkflowServiceHandler(&workflowService{client: c}, opts...)
}

// spaHandler serves the embedded SPA. index.html has its <base href> rewritten
// to cfg.BasePath at serve time; all other assets are served as-is from web/dist.
func spaHandler(basePath string) http.Handler {
	dist := spaFS()
	if dist == nil {
		return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			http.Error(w, "dbosui: SPA build missing — run `pnpm --dir web build`", http.StatusInternalServerError)
		})
	}

	index, err := fs.ReadFile(dist, "index.html")
	if err != nil {
		return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			http.Error(w, "dbosui: index.html missing from embedded SPA", http.StatusInternalServerError)
		})
	}
	index = []byte(strings.ReplaceAll(string(index), `<base href="/" />`, `<base href="`+basePath+`" />`))

	fileServer := http.FileServerFS(dist)

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Trim the request path to a clean relative path.
		urlPath := strings.TrimPrefix(path.Clean(r.URL.Path), "/")

		// Serve index.html for the root or any unknown path (SPA routing).
		if urlPath == "" || urlPath == "index.html" {
			serveIndex(w, index)
			return
		}
		if _, err := fs.Stat(dist, urlPath); err != nil {
			serveIndex(w, index)
			return
		}
		fileServer.ServeHTTP(w, r)
	})
}

func serveIndex(w http.ResponseWriter, body []byte) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	_, _ = w.Write(body)
}
