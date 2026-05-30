# Kubernetes Deployment

The Traefik ingress in `kahoot.yaml` serves
`https://xiaxia23bday.maotek.nl`. cert-manager requests and renews the trusted
TLS certificate through Let's Encrypt.

## Prerequisites

- Point the DNS record for `xiaxia23bday.maotek.nl` to the public IP address
  that exposes Traefik.
- Allow inbound internet traffic on ports `80` and `443`. Let's Encrypt uses
  port `80` for the HTTP-01 ownership check.
- Run the commands below from the repository root on a machine with access to
  the Kubernetes cluster.

## Install cert-manager

Install cert-manager once per cluster:

```bash
kubectl apply -f \
  https://github.com/cert-manager/cert-manager/releases/download/v1.20.2/cert-manager.yaml

kubectl -n cert-manager rollout status deployment/cert-manager
kubectl -n cert-manager rollout status deployment/cert-manager-webhook
kubectl -n cert-manager rollout status deployment/cert-manager-cainjector
```

## Deploy

Apply the application manifest:

```bash
kubectl apply -f k8s/kahoot.yaml
```

The manifest creates a namespace-scoped `letsencrypt-prod` issuer. cert-manager
uses it to request the certificate and stores the result in the `kahoot-tls`
secret automatically.

## Verify HTTPS

Certificate issuance can take a few minutes:

```bash
kubectl -n kahoot get issuer,certificate,certificaterequest,order,challenge
kubectl -n kahoot get secret kahoot-tls
curl -I https://xiaxia23bday.maotek.nl
```

The `Certificate` should report `READY=True`. If issuance fails, inspect the
resources:

```bash
kubectl -n kahoot describe issuer letsencrypt-prod
kubectl -n kahoot describe certificate
kubectl -n kahoot describe challenge
```

## Local self-signed certificate

For a development environment without a public DNS record, remove the
`cert-manager.io/issuer` ingress annotation first so cert-manager does not
replace the manual secret. Then generate a self-signed certificate:

```bash
openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
  -keyout tls.key -out tls.crt \
  -subj "/CN=xiaxia23bday.maotek.nl" \
  -addext "subjectAltName=DNS:xiaxia23bday.maotek.nl"

kubectl -n kahoot create secret tls kahoot-tls \
  --cert=./tls.crt --key=./tls.key
```

A browser will warn about a self-signed certificate unless you trust it
locally. Do not commit `tls.crt` or `tls.key`.
