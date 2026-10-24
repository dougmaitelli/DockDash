---
title: Limitations
description: Review current DockDash monitoring limitations.
---

This page documents known product limitations.

## Kubernetes network and disk monitoring

### Current limitation

DockDash currently reads CPU and memory usage for Kubernetes containers through the Kubernetes Metrics API. It does not collect Kubernetes network receive and transmit totals or disk read and write activity. Those resource readings are currently available only for Docker containers.
