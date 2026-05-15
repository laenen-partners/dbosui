package dbosui

import (
	"embed"
	"io/fs"
)

// webDist is the built SPA. The directory exists after `pnpm --dir web build`.
// During development the file may be empty; we ship a placeholder so go:embed
// never fails to compile.
//
//go:embed all:web/dist
var webDist embed.FS

// spaFS returns the rooted FS of the built SPA, or nil if the build is missing.
func spaFS() fs.FS {
	sub, err := fs.Sub(webDist, "web/dist")
	if err != nil {
		return nil
	}
	if _, err := fs.Stat(sub, "index.html"); err != nil {
		return nil
	}
	return sub
}
