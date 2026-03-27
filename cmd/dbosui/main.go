package main

import (
	"bufio"
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/laenen-partners/dbosui"
)

func main() {
	port := flag.Int("port", 8080, "port to listen on")
	mock := flag.Bool("mock", false, "use mock data instead of database")
	flag.Parse()

	// Load .env file if it exists (does not override existing env vars).
	loadDotenv(".env")

	// PORT env var overrides the flag.
	if p, err := strconv.Atoi(os.Getenv("PORT")); err == nil {
		*port = p
	}

	dsn := os.Getenv("DBOS_POSTGRES_URL")

	var client dbosui.Client
	if *mock {
		fmt.Println("Running with mock data")
		client = dbosui.MockClient()
	} else if dsn == "" {
		fmt.Println("DBOS_POSTGRES_URL not set. Use --mock for demo data, or set DBOS_POSTGRES_URL in .env")
		os.Exit(1)
	} else {
		fmt.Printf("Connecting to DBOS database: %s\n", redactDSN(dsn))
		ctx := context.Background()
		dbosClient, err := dbosui.NewDBOSClient(ctx, dsn)
		if err != nil {
			log.Fatalf("Failed to connect to DBOS: %v", err)
		}
		defer dbosClient.Shutdown(5 * time.Second)
		client = dbosClient
	}

	fmt.Printf("Starting DBOS Admin UI on http://localhost:%d\n", *port)

	cfg := dbosui.Config{
		Client: client,
	}

	if err := dbosui.Run(cfg, *port); err != nil {
		log.Fatal(err)
	}
}

// loadDotenv reads a .env file and sets any variables not already in the environment.
func loadDotenv(path string) {
	f, err := os.Open(path)
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
		value = strings.TrimSpace(value)
		// Don't override existing env vars.
		if _, exists := os.LookupEnv(key); !exists {
			os.Setenv(key, value)
		}
	}
}

// redactDSN hides the password in a connection string for logging.
func redactDSN(dsn string) string {
	result := []byte(dsn)
	inPassword := false
	afterScheme := false
	for i := range result {
		if i > 2 && string(result[i-2:i+1]) == "://" {
			afterScheme = true
		}
		if afterScheme && result[i] == ':' && !inPassword {
			inPassword = true
			continue
		}
		if inPassword && result[i] == '@' {
			inPassword = false
			continue
		}
		if inPassword {
			result[i] = '*'
		}
	}
	return string(result)
}
