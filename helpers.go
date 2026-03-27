package dbosui

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"time"
)

func truncateID(id string) string {
	if len(id) > 24 {
		return id[:24] + "..."
	}
	return id
}

func formatTime(t time.Time) string {
	if t.IsZero() {
		return "—"
	}
	return t.Format("2006-01-02 15:04:05")
}

func formatDuration(d time.Duration) string {
	if d < time.Second {
		return fmt.Sprintf("%dms", d.Milliseconds())
	}
	if d < time.Minute {
		return fmt.Sprintf("%.1fs", d.Seconds())
	}
	if d < time.Hour {
		return fmt.Sprintf("%.1fm", d.Minutes())
	}
	return fmt.Sprintf("%.1fh", d.Hours())
}

func prettyJSON(v any) string {
	// If it's a string, it might be base64-encoded JSON from DBOS.
	if s, ok := v.(string); ok {
		return prettyJSONString(s)
	}
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return fmt.Sprintf("%v", v)
	}
	return string(b)
}

// prettyJSONString tries to decode a string as base64 → JSON, plain JSON, or returns as-is.
func prettyJSONString(s string) string {
	// Try base64 decode first (DBOS encodes values as base64 JSON).
	if decoded, err := base64.StdEncoding.DecodeString(s); err == nil {
		if formatted := tryFormatJSON(decoded); formatted != "" {
			return formatted
		}
		// Base64 decoded but not JSON - return decoded string.
		return string(decoded)
	}
	// Try parsing as plain JSON.
	if formatted := tryFormatJSON([]byte(s)); formatted != "" {
		return formatted
	}
	return s
}

func tryFormatJSON(b []byte) string {
	var v any
	if err := json.Unmarshal(b, &v); err != nil {
		return ""
	}
	formatted, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return ""
	}
	return string(formatted)
}

func truncateJSON(v any) string {
	s := prettyJSON(v)
	// Collapse to single line for truncation.
	compact, err := json.Marshal(json.RawMessage(s))
	if err != nil {
		if len(s) > 60 {
			return s[:60] + "..."
		}
		return s
	}
	cs := string(compact)
	if len(cs) > 60 {
		return cs[:60] + "..."
	}
	return cs
}

// decodeDBOSValue decodes a DBOS-stored value (base64 JSON or plain JSON string).
func decodeDBOSValue(s string) string {
	return prettyJSONString(s)
}
