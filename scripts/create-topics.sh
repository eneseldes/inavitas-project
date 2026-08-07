#!/usr/bin/env bash
set -euo pipefail

# Kafka topic'lerini ve DLQ topic'lerini oluşturur.
# `--if-not-exists` parametresi ile güvenle tekrar çalıştırılabilir.

TOPICS=(
  outage.created outage.energized outage.linked
  work-order.created work-order.done work-order.linked
)
DLQ_SUFFIX=".DLQ"
KCMD="/opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092"

for t in "${TOPICS[@]}"; do
  docker compose exec -T kafka $KCMD --create --if-not-exists \
    --topic "$t" --partitions 3 --replication-factor 1
  docker compose exec -T kafka $KCMD --create --if-not-exists \
    --topic "${t}${DLQ_SUFFIX}" --partitions 1 --replication-factor 1
done

docker compose exec -T kafka $KCMD --list
