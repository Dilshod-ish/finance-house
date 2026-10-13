# FinCore — developer entry points. Everything here is also a pnpm script, so
# CI and humans run the same commands.
SHELL := /bin/bash
.DEFAULT_GOAL := help
.PHONY: help install up down dev test test-unit test-integration typecheck lint format \
        db-migrate db-seed db-reset db-generate coverage ci

help: ## Show this help
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

install: ## Install workspace dependencies
	pnpm install

up: ## Start Postgres 16 + Redis
	docker compose -f docker/docker-compose.yml up -d --wait

down: ## Stop infrastructure
	docker compose -f docker/docker-compose.yml down

dev: ## Run all packages in watch mode
	pnpm dev

typecheck: ## Type-check every package
	pnpm typecheck

lint: ## Lint every package
	pnpm lint

format: ## Format the repository
	pnpm format

test: ## Run all tests
	pnpm test

test-unit: ## Run unit tests only
	pnpm test:unit

test-integration: ## Run integration tests (needs Docker or TEST_DATABASE_URL)
	pnpm test:integration

coverage: ## Run tests with coverage (ledger enforces 100% branches)
	pnpm coverage

db-generate: ## Generate a Drizzle migration from the schema
	pnpm db:generate

db-migrate: ## Apply migrations to $$DATABASE_URL
	pnpm db:migrate

db-seed: ## Seed deterministic demo data (~200 entries, two tenants)
	pnpm db:seed

db-reset: ## Drop, recreate, migrate and seed
	pnpm db:reset

ci: typecheck lint test ## What CI runs
