package dbosui

import (
	"context"
	"crypto/rand"
	"io/fs"
	"net/http"

	"github.com/a-h/templ"
	"github.com/go-chi/chi/v5"
	"github.com/laenen-partners/dsx"
	"github.com/laenen-partners/dsx/showcase"
	"github.com/laenen-partners/dsx/stream"
	"github.com/laenen-partners/pubsub"
)

// Config configures the DBOS admin UI handler.
type Config struct {
	// Client provides access to DBOS workflow data.
	Client Client

	// BasePath is the URL prefix where the handler is mounted (e.g. "/admin").
	// Used for generating correct API URLs in templates.
	// Default: "/dbos".
	BasePath string
}

func (c *Config) defaults() {
	if c.BasePath == "" {
		c.BasePath = "/dbos"
	}
}

// Handler returns an http.Handler serving the DBOS admin UI.
// Mount it under a path prefix in your router.
//
// Chi:
//
//	r.Mount("/dbos", dbosui.Handler(cfg))
//
// Gin:
//
//	h := dbosui.Handler(cfg)
//	ginRouter.Any("/dbos/*path", gin.WrapH(h))
func Handler(cfg Config) http.Handler {
	cfg.defaults()

	secret := make([]byte, 32)
	_, _ = rand.Read(secret)

	r := chi.NewRouter()
	r.Use(dsx.Middleware(dsx.MiddlewareConfig{
		Secret: secret,
		Secure: false,
	}))
	r.Use(dsx.SecurityHeadersMiddleware())
	r.Use(basePathMiddleware(cfg.BasePath))

	// Serve dsx static assets.
	staticFS, _ := fs.Sub(dsx.Static, "static")
	r.Handle("/assets/*", http.StripPrefix("/assets/", http.FileServerFS(staticFS)))

	h := &workflowHandlers{client: cfg.Client}

	// Full HTML page.
	r.Get("/", func(w http.ResponseWriter, r *http.Request) {
		_ = AdminPage().Render(r.Context(), w)
	})

	// Fragment endpoints.
	r.Get("/workflows/list", h.list())
	r.Get("/workflows/stats", h.stats())
	r.Get("/workflows/{id}/detail", h.detail())
	r.Get("/workflows/{id}/steps", h.steps())
	r.Post("/workflows/{id}/cancel", h.cancel())
	r.Post("/workflows/{id}/resume", h.resume())

	return r
}

// Run starts a standalone admin UI server using the DSX showcase.
// This provides the full showcase chrome: identity switcher, themes, etc.
func Run(cfg Config, port int) error {
	cfg.defaults()
	h := &workflowHandlers{client: cfg.Client}

	return showcase.Run(showcase.Config{
		Port: port,
		Pages: map[string]templ.Component{
			"/": ShowcasePage(),
		},
		Setup: func(_ context.Context, r chi.Router, _ *pubsub.Bus, _ *stream.Relay) error {
			r.Route("/showcase", func(r chi.Router) {
				r.Get("/workflows/list", h.list())
				r.Get("/workflows/stats", h.stats())
				r.Get("/workflows/{id}/detail", h.detail())
							r.Get("/workflows/{id}/steps", h.steps())
				r.Post("/workflows/{id}/cancel", h.cancel())
				r.Post("/workflows/{id}/resume", h.resume())
			})
			return nil
		},
	})
}

func basePathMiddleware(basePath string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			dsxCtx := dsx.FromContext(r.Context())
			dsxCtx.BasePath = basePath
			next.ServeHTTP(w, r.WithContext(dsxCtx.WithContext(r.Context())))
		})
	}
}
