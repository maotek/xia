# Kubernetes Deployment

The application is available at `https://xiaxia23bday.maotek.nl`.
Traefik serves the ingress and cert-manager automatically obtains and renews
the TLS certificate through Let's Encrypt.

## Requirements

- `kubectl` must be configured for the Kubernetes cluster.
- Traefik must be installed with an ingress class named `traefik`.
- `xiaxia23bday.maotek.nl` must point to the public Traefik IP address.
- Ports `80` and `443` must be reachable from the internet. Let's Encrypt uses
  port `80` for HTTP-01 validation.

## Deploy

From the repository root, run:

```bash
./k8s/deploy.sh
```

The script installs cert-manager, waits until it is ready, and applies
`k8s/kahoot.yaml`.

## Roll out a new build

After publishing new backend or frontend images to GHCR, run:

```bash
./k8s/rollout.sh
```

The script reapplies `k8s/kahoot.yaml`, restarts both deployments so they pull
the latest images, and waits for the rollouts to finish.

## Install cert-manager manually

cert-manager only needs to be installed once per cluster. To install it
without the deployment script, run:

```bash
kubectl apply -f \
  https://github.com/cert-manager/cert-manager/releases/download/v1.20.2/cert-manager.yaml

kubectl -n cert-manager rollout status deployment/cert-manager
kubectl -n cert-manager rollout status deployment/cert-manager-webhook
kubectl -n cert-manager rollout status deployment/cert-manager-cainjector
```

Then deploy the application:

```bash
kubectl apply -f k8s/kahoot.yaml
```

## TLS certificate

The `letsencrypt-prod` issuer in `k8s/kahoot.yaml` manages the production
certificate. cert-manager generates the private key and stores the certificate
in the `kahoot-tls` secret used by the ingress.

Do not create or edit `kahoot-tls` manually.

## Verify

Certificate issuance can take a few minutes:

```bash
kubectl -n kahoot get issuer,certificate,secret
curl -I https://xiaxia23bday.maotek.nl
```

The `letsencrypt-prod` issuer and `kahoot-tls` certificate should report
`READY=True`.

## Ollama chat

The chat page is available at `/chat`. The manifest expects an existing
service named `ollama` on port `80` in the `ollama` namespace. A separate
Ingress exposes only Ollama's `/api/chat` endpoint on the application host.
The frontend always uses the `qwen2.5:1.5b` model.

The browser sends the system prompt and conversation directly to Ollama.
There is no application backend, authentication, or rate limiting in this
path, so anyone who can access the site can use the configured models.

## Troubleshooting

If the certificate is not ready, inspect the Let's Encrypt HTTP-01 validation:

```bash
kubectl -n kahoot describe issuer letsencrypt-prod
kubectl -n kahoot describe certificate kahoot-tls
kubectl -n kahoot get order,challenge
kubectl -n kahoot describe challenge
```

Confirm that DNS points to the public Traefik IP address and that port `80` is
reachable from the internet.
