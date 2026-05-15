package main

import (
	"bufio"
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/urfave/cli/v3"

	"github.com/laenen-partners/dbosui"
)

func main() {
	cmd := &cli.Command{
		Name:    "dbosui",
		Usage:   "DBOS workflow admin UI",
		Version: "0.1.0",
		Commands: []*cli.Command{
			serveCommand(),
		},
		DefaultCommand: "serve",
	}

	if err := cmd.Run(context.Background(), os.Args); err != nil {
		log.Fatal(err)
	}
}

func serveCommand() *cli.Command {
	return &cli.Command{
		Name:  "serve",
		Usage: "Run the DBOS admin UI HTTP server",
		Flags: []cli.Flag{
			&cli.IntFlag{
				Name:    "port",
				Aliases: []string{"p"},
				Usage:   "TCP port to listen on",
				Value:   8080,
				Sources: cli.EnvVars("PORT"),
			},
			&cli.StringFlag{
				Name:    "database-url",
				Usage:   "Postgres connection string for the DBOS system DB",
				Sources: cli.EnvVars("DATABASE_URL", "DBOS_POSTGRES_URL"),
			},
			&cli.StringFlag{
				Name:  "base-path",
				Usage: "URL prefix the UI is served under",
				Value: "/",
			},
			&cli.BoolFlag{
				Name:  "mock",
				Usage: "Serve mock data instead of connecting to a database",
			},
			&cli.StringFlag{
				Name:  "env-file",
				Usage: "Path to a .env file to load (skipped if missing)",
				Value: ".env",
			},
		},
		Action: runServe,
	}
}

func runServe(ctx context.Context, cmd *cli.Command) error {
	if path := cmd.String("env-file"); path != "" {
		loadDotenv(path)
	}

	port := int(cmd.Int("port"))
	basePath := cmd.String("base-path")
	mock := cmd.Bool("mock")
	dsn := cmd.String("database-url")

	var client dbosui.Client
	switch {
	case mock:
		fmt.Println("Running with mock data")
		client = dbosui.MockClient()
	case dsn == "":
		return fmt.Errorf("no database connection: set --database-url, $DATABASE_URL/$DBOS_POSTGRES_URL, or pass --mock")
	default:
		fmt.Printf("Connecting to DBOS database: %s\n", redactDSN(dsn))
		dbosClient, err := dbosui.NewDBOSClient(ctx, dsn)
		if err != nil {
			return fmt.Errorf("connect to DBOS: %w", err)
		}
		defer dbosClient.Shutdown(5 * time.Second)
		client = dbosClient
	}

	mux := http.NewServeMux()
	uiHandler := dbosui.Handler(dbosui.Config{Client: client, BasePath: basePath})
	if basePath == "/" || basePath == "" {
		mux.Handle("/", uiHandler)
	} else {
		prefix := strings.TrimSuffix(basePath, "/")
		mux.Handle(prefix+"/", http.StripPrefix(prefix, uiHandler))
	}

	srv := &http.Server{
		Addr:              fmt.Sprintf(":%d", port),
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = srv.Shutdown(shutdown)
	}()

	signalCtx, stop := signal.NotifyContext(ctx, os.Interrupt, syscall.SIGTERM)
	defer stop()
	go func() {
		<-signalCtx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = srv.Shutdown(shutdown)
	}()

	fmt.Printf("DBOS Admin UI listening on http://localhost:%d%s\n", port, basePath)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		return err
	}
	return nil
}

// loadDotenv reads key=value pairs from path and sets them in the process
// environment if not already set. Missing files are silently ignored.
func loadDotenv(path string) {
	abs, _ := filepath.Abs(path)
	f, err := os.Open(abs)
	if err != nil {
		return
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key = strings.TrimSpace(key)
		value = strings.TrimSpace(strings.Trim(value, `"'`))
		if _, exists := os.LookupEnv(key); !exists {
			_ = os.Setenv(key, value)
		}
	}
}

// redactDSN hides the password in a Postgres URL for safe logging.
func redactDSN(dsn string) string {
	out := []byte(dsn)
	afterScheme := false
	inPassword := false
	for i := range out {
		if i > 2 && string(out[i-2:i+1]) == "://" {
			afterScheme = true
		}
		if afterScheme && out[i] == ':' && !inPassword {
			inPassword = true
			continue
		}
		if inPassword && out[i] == '@' {
			inPassword = false
			continue
		}
		if inPassword {
			out[i] = '*'
		}
	}
	return string(out)
}
