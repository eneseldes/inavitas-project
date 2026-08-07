#!/usr/bin/env bash
set -euo pipefail

# Faz 4 — Kafka topic'lerini oluşturur. AUTO_CREATE_TOPICS_ENABLE=false
# olduğu için bu script her zaman elle çalıştırılmalı (bkz. docs/04-KURULUM.md).
# Yazım hatası yaparsan Kafka sessizce yeni bir topic açmaz, sen de burada
# `--if-not-exists` ile tekrar tekrar güvenle çalıştırabilirsin.

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
