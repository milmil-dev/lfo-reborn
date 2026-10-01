// Package jsoncol holds the Go type sqlc uses for JSON-in-TEXT columns.
package jsoncol

import (
	"errors"
	"fmt"
)

// Raw is a JSON document stored as SQLite TEXT. It scans from string/[]byte and
// marshals as-is, so API responses embed it as an object rather than a quoted string.
// (json.RawMessage is an alias of jsontext.Value since Go 1.27, which database/sql
// cannot scan into.)
type Raw []byte

func (r *Raw) Scan(src any) error {
	switch v := src.(type) {
	case string:
		*r = append((*r)[:0], v...)
	case []byte:
		*r = append((*r)[:0], v...)
	case nil:
		*r = nil
	default:
		return fmt.Errorf("jsoncol.Raw: cannot scan %T", src)
	}
	return nil
}

func (r Raw) MarshalJSON() ([]byte, error) {
	if len(r) == 0 {
		return []byte("null"), nil
	}
	return r, nil
}

func (r *Raw) UnmarshalJSON(b []byte) error {
	if r == nil {
		return errors.New("jsoncol.Raw: UnmarshalJSON on nil pointer")
	}
	*r = append((*r)[:0], b...)
	return nil
}
