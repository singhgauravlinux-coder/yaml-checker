IMAGE     ?= ghcr.io/OWNER/plumb
TAG       ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)
BASE_PATH ?= /
NAMESPACE ?= plumb
PORT      ?= 8080

.PHONY: help install dev build image run stop logs push deploy status undeploy forward

help: ## Show this list
	@grep -hE '^[a-z-]+:.*##' $(MAKEFILE_LIST) | sed 's/:.*##/\t/' | expand -t18

install: ## Install dependencies
	npm install

dev: ## Vite dev server on :5173
	npm run dev

build: ## Typecheck and build to dist/
	npm run build

image: ## Build the container image
	docker build --build-arg BASE_PATH=$(BASE_PATH) -t $(IMAGE):$(TAG) -t $(IMAGE):latest .

run: image ## Run the image locally on :$(PORT)
	docker run --rm -d --name plumb -p $(PORT):8080 \
		--read-only --tmpfs /tmp --tmpfs /var/cache/nginx \
		--cap-drop ALL --security-opt no-new-privileges:true \
		$(IMAGE):$(TAG)
	@echo "http://localhost:$(PORT)"

stop: ## Stop the local container
	-docker rm -f plumb

logs: ## Tail local container logs
	docker logs -f plumb

push: ## Push the image
	docker push $(IMAGE):$(TAG)

deploy: ## Apply manifests with the current tag
	cd k8s && kustomize edit set image $(IMAGE)=$(IMAGE):$(TAG)
	kubectl apply -k k8s
	kubectl -n $(NAMESPACE) rollout status deploy/plumb --timeout=120s

status: ## Show what is running
	kubectl -n $(NAMESPACE) get pods,svc,ingress,hpa

forward: ## Reach the Service without an ingress
	kubectl -n $(NAMESPACE) port-forward svc/plumb $(PORT):80

undeploy: ## Delete everything
	kubectl delete -k k8s --ignore-not-found
