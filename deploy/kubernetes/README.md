# Kubernetes

Plain manifests, no Helm, no operator — four files you can read in a minute and
`kubectl apply -k .` in one command. They target a managed Kubernetes service
(Infomaniak's, Exoscale SKS, or any other) and assume two cluster add-ons that
managed offerings normally provide:

- an **ingress controller** (`ingressClassName: nginx` below), and
- **cert-manager** with a `ClusterIssuer` named `letsencrypt`, for TLS.

If your cluster names those differently, the two strings to change are in
`ingress.yaml`. If it has neither, the Compose deployment one directory up gives
you the same thing on a single VM with less to operate.

## Deploy

```bash
# 1. The secrets. Never in git — this reads them from your shell or a file.
kubectl create namespace you-go-further
kubectl -n you-go-further create secret generic ygf-secrets \
  --from-literal=AUTH_SECRET="$(openssl rand -hex 32)" \
  --from-literal=DATABASE_URL='postgres://…?sslmode=require' \
  --from-literal=MAIL_SMTP_URL='smtps://…'

# 2. The workload.
kubectl apply -k deploy/kubernetes

# 3. Watch it come up. The readiness probe hits /api/health, which reads the
#    store — so a pod only takes traffic once it can reach its database.
kubectl -n you-go-further rollout status deploy/you-go-further
```

## What the manifests assume

**The database is managed, not in the cluster.** A production Postgres wants
backups, point-in-time recovery and a failover you did not write; a managed
Swiss instance gives you all three for less than the hours of running your own.
`DATABASE_URL` is a secret, and `sslmode=require` is not optional across a
network.

**Two replicas, and a disruption budget.** Two is the smallest number that
survives a node drain, and the app is stateless — every piece of state is in
Postgres — so replicas need no coordination. The `PodDisruptionBudget` stops a
cluster upgrade from taking both at once.

**Rolling updates are safe because shutdown is graceful.** The container handles
SIGTERM, stops accepting connections and finishes what it is serving; the
`preStop` sleep gives the ingress controller time to notice the pod is leaving
before it stops answering, which is what removes the handful of 502s that
otherwise appear on every deploy.
