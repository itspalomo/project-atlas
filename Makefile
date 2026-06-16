COMPOSE ?= docker compose
ATLAS_API_WORKSPACE := @project-atlas/atlas-api

.PHONY: env install build typecheck test migrate seed up down logs ps

env:
	@test -f .env || cp .env.example .env
	@echo "Created .env if it did not already exist."

install:
	npm install

build:
	npm run build --workspace $(ATLAS_API_WORKSPACE)

typecheck:
	npm run typecheck --workspace $(ATLAS_API_WORKSPACE)

test:
	npm run test --workspace $(ATLAS_API_WORKSPACE)

migrate:
	npm run migrate --workspace $(ATLAS_API_WORKSPACE)

seed:
	npm run seed --workspace $(ATLAS_API_WORKSPACE)

up:
	$(COMPOSE) up -d --build

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f --tail=200

ps:
	$(COMPOSE) ps
