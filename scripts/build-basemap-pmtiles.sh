#!/usr/bin/env bash
set -euo pipefail

# Altlık haritayı (basemap) Türkiye OSM özütünden tek dosyalık bir PMTiles arşivine derler.
# Tamamen self-host: üretilen dosya `apps/web/public/basemap/` altına yazılır, Vite build'i
# statik olarak `dist`'e kopyalar, ayrı bir tile-server süreci gerekmez.
#
# Bağımlılıklar: java (17+), curl. Planetiler jar'ı ilk çalıştırmada indirilir ve `.cache/`
# altında saklanır.
#
# Kullanım: ./scripts/build-basemap-pmtiles.sh [--force]

OSM_EXTRACT_URL="https://download.geofabrik.de/europe/turkey-latest.osm.pbf"
PLANETILER_JAR_URL="https://github.com/onthegomap/planetiler/releases/latest/download/planetiler.jar"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CACHE_DIR="$ROOT_DIR/.cache/basemap"
OUTPUT_DIR="$ROOT_DIR/apps/web/public/basemap"
OUTPUT_FILE="$OUTPUT_DIR/turkey-basemap.pmtiles"

FORCE=0
[[ "${1:-}" == "--force" ]] && FORCE=1

if [[ -f "$OUTPUT_FILE" && "$FORCE" -eq 0 ]]; then
  echo "Basemap zaten var: $OUTPUT_FILE (yeniden üretmek için --force)"
  exit 0
fi

command -v java >/dev/null || { echo "java bulunamadı — Planetiler için Java 17+ gerekli." >&2; exit 1; }
command -v curl >/dev/null || { echo "curl bulunamadı." >&2; exit 1; }

mkdir -p "$CACHE_DIR" "$OUTPUT_DIR"

OSM_FILE="$CACHE_DIR/turkey-latest.osm.pbf"
if [[ ! -f "$OSM_FILE" ]]; then
  echo "OSM özütü indiriliyor (Geofabrik, büyük dosya): $OSM_EXTRACT_URL"
  curl -fL --progress-bar -o "$OSM_FILE.tmp" "$OSM_EXTRACT_URL"
  mv "$OSM_FILE.tmp" "$OSM_FILE"
fi

PLANETILER_JAR="$CACHE_DIR/planetiler.jar"
if [[ ! -f "$PLANETILER_JAR" ]]; then
  echo "Planetiler indiriliyor: $PLANETILER_JAR_URL"
  curl -fL --progress-bar -o "$PLANETILER_JAR.tmp" "$PLANETILER_JAR_URL"
  mv "$PLANETILER_JAR.tmp" "$PLANETILER_JAR"
fi

echo "PMTiles üretiliyor → $OUTPUT_FILE"
java -Xmx4g -jar "$PLANETILER_JAR" \
  --osm-path="$OSM_FILE" \
  --output="$OUTPUT_FILE.tmp" \
  --force

mv "$OUTPUT_FILE.tmp" "$OUTPUT_FILE"
echo "Bitti: $OUTPUT_FILE"
