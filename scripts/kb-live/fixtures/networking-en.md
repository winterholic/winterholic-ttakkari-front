# Cluster Networking

Cluster networking connects every pod to a flat network so workloads talk without translation.

## Service Types

A ClusterIP service exposes pods inside the cluster and uses kube-proxy to program routing rules.

### Ingress Policy

An ingress controller routes external HTTP traffic to a service and enforces access restrictions.
