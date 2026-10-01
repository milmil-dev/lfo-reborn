// Package openapi embeds the API description served at /openapi.yaml.
package openapi

import _ "embed"

//go:embed openapi.yaml
var Spec []byte
