.PHONY: help data sqlc dev dev-api dev-web test test-api test-web check build publish-data

help: ## List available targets
	@grep -hE '^[a-zA-Z_-]+:.*##' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*##"}{printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

data: ## Rebuild data/lfo.db + data/assets from the original client (LFO_SRC)
	cd pipeline && bun install && bun build.ts && bun sprites.ts && bun catalog.ts && bun stories.ts --effects --items --beasts --lobby --all && bun catalog.ts && bun ui.ts && bun ui-hd.ts && bun game-hd.ts && bun profile.ts && bun shops.ts && bun relics.ts

sqlc: ## Regenerate Go query code from api/internal/store/queries
	cd api && sqlc generate

dev: ## Run API (:8080) and web (:5173) together
	@trap 'kill 0; wait' INT TERM EXIT; \
	cd api && go run ./cmd/server & \
	cd web && pnpm run dev & \
	wait

dev-api: ## Run the Go API on :8080
	cd api && go run ./cmd/server

dev-web: ## Run the Vite+ dev server on :5173
	cd web && pnpm run dev

test: test-api test-web ## Run all tests

test-api: ## Go tests (need data/lfo.db)
	cd api && go vet ./... && go test ./...

test-web: ## Web unit tests
	cd web && pnpm run test

check: ## Lint, format and type-check the web app
	cd web && pnpm run check && pnpm exec tsc -b --noEmit

build: ## Production build of the API binary and the web SPA
	cd api && go build -o bin/lfo-api ./cmd/server
	cd web && pnpm run build

publish-data: ## Upload assets.tar + fixtures.tar.gz to the private R2 bucket for CI
	deploy/publish-data.sh
