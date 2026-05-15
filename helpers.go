package dbosui

import "encoding/base64"

// decodeDBOSValue decodes a DBOS-stored value. DBOS stores values as base64
// of the underlying JSON string; if the input is not valid base64 we return
// it untouched so the frontend can still display it.
func decodeDBOSValue(s string) string {
	if s == "" {
		return ""
	}
	if decoded, err := base64.StdEncoding.DecodeString(s); err == nil {
		return string(decoded)
	}
	return s
}
