.PHONY: help install dev prod down restart logs ps db-backup db-restore db-shell clean

# Colors
GREEN  := \033[0;32m
YELLOW := \033[0;33m
NC     := \033[0m

help: ## Show this help message
	@echo "$(GREEN)Check-in Work System - Make Commands$(NC)"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(YELLOW)%-15s$(NC) %s\n", $$1, $$2}'
	@echo ""

install: ## Install dependencies
	@npm install

dev: ## Run development server with Docker
	@docker-compose up -d
	@echo "$(GREEN)Development server running at http://localhost:3000$(NC)"

prod: ## Run production server with Docker
	@docker-compose -f docker-compose.prod.yml up -d --build
	@echo "$(GREEN)Production server running at http://localhost:3000$(NC)"

dev-with-tools: ## Run development with admin tools
	@docker-compose --profile tools up -d
	@echo "$(GREEN)Dev server: http://localhost:3000$(NC)"
	@echo "$(GREEN)Adminer: http://localhost:8080$(NC)"

down: ## Stop all containers
	@docker-compose down

prod-down: ## Stop production containers
	@docker-compose -f docker-compose.prod.yml down

restart: ## Restart containers
	@docker-compose restart

logs: ## Show logs (use: make logs SERVICE=app)
	@docker-compose logs -f $(or $(SERVICE),)

ps: ## Show running containers
	@docker-compose ps

db-backup: ## Backup database (use: make db-backup FILE=backup.sql)
	@docker exec checkinwork_mariadb mysqldump -u root -p$(DB_ROOT_PASSWORD) checkinwork_db > $(or $(FILE),backup_$$(date +%Y%m%d_%H%M%S).sql)
	@echo "$(GREEN)Database backed up to $(or $(FILE),backup_YYYYMMDD_HHMMSS.sql)$(NC)"

db-restore: ## Restore database (use: make db-restore FILE=backup.sql)
	@docker exec -i checkinwork_mariadb mysql -u root -p$(DB_ROOT_PASSWORD) checkinwork_db < $(FILE)
	@echo "$(GREEN)Database restored from $(FILE)$(NC)"

db-shell: ## Open MariaDB shell
	@docker exec -it checkinwork_mariadb mysql -u root -p$(DB_ROOT_PASSWORD) checkinwork_db

clean: ## Remove containers and volumes
	@docker-compose down -v
	@echo "$(GREEN)Cleaned up containers and volumes$(NC)"

clean-all: ## Clean everything including node_modules
	@docker-compose down -v
	@rm -rf node_modules
	@echo "$(GREEN)Cleaned up everything$(NC)"

rebuild: ## Rebuild containers without cache
	@docker-compose build --no-cache

health: ## Check health of all services
	@docker-compose ps
	@echo ""
	@echo "Health checks:"
	@docker inspect --format='{{.Name}}: {{.State.Health.Status}}' $$(docker-compose ps -q) 2>/dev/null || true

# Development helpers
setup: ## Initial setup (install deps + copy env)
	@if [ ! -f .env ]; then cp .env.example .env; fi
	@npm install
	@echo "$(GREEN)Setup complete! Run 'make dev' to start$(NC)"

# Production helpers
deploy: ## Deploy to production
	@echo "$(YELLOW)Deploying to production...$(NC)"
	@docker-compose -f docker-compose.prod.yml down
	@docker-compose -f docker-compose.prod.yml up -d --build
	@echo "$(GREEN)Deployed successfully!$(NC)"
