# Kubernetes Deployment

The Traefik ingress in `kahoot.yaml` terminates HTTPS using the `kahoot-tls`
secret in the `kahoot` namespace.

## Local self-signed certificate

Replace `kahoot.example.com` with the hostname you use to access the
application:

```bash
openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
  -keyout tls.key -out tls.crt \
  -subj "/CN=kahoot.example.com" \
  -addext "subjectAltName=DNS:kahoot.example.com"

kubectl -n kahoot create secret tls kahoot-tls \
  --cert=./tls.crt --key=./tls.key
```

A browser will warn about a self-signed certificate unless you trust it
locally.

## Production certificate

Use the certificate and matching private key issued for your real domain:

```bash
kubectl -n kahoot create secret tls kahoot-tls \
  --cert=/path/to/tls.crt --key=/path/to/tls.key
```

Do not commit `tls.crt` or `tls.key`.

## Deploy

Apply the manifest first so the `kahoot` namespace exists, then create the TLS
secret:

```bash
kubectl apply -f k8s/kahoot.yaml
kubectl -n kahoot create secret tls kahoot-tls \
  --cert=/path/to/tls.crt --key=/path/to/tls.key
```
