import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { VOLTAGE_LEVELS, type VoltageLevel } from '../../types/network.ts';
import { LEGEND_IDS, type LegendId } from './networkLayers.ts';

/** Ankara il merkezi — bir dış odaklama (`focus`/`unit`) yoksa haritanın açılış görünümü. */
export const DEFAULT_VIEW = { lng: 32.85, lat: 39.92, zoom: 10 };

/** `?layers=` için "hiçbiri" sentinel'i — boş string varsayılan kümeye düşerdi. */
const NO_LAYERS = 'none';

export interface MapView {
  lng: number;
  lat: number;
  zoom: number;
}

/**
 * Harita durumunu (aktif kategoriler, gerilim filtresi, bağımsız katmanlar, görünüm, seçili
 * eleman) URL query param'ında tutar — geri tuşu ve link paylaşımı bunun üzerine kurulur.
 * Kategori/gerilim listeleri boşsa "hepsi açık" varsayılan durumdur; URL'i kirletmemek için
 * varsayılan durum hiç yazılmaz.
 */
export function useMapState() {
  const [params, setParams] = useSearchParams();

  const legend = useMemo<Set<LegendId>>(() => {
    const raw = params.get('layers');
    // Varsayılan: HEPSİ açık. Ne kadarının çizileceğini efsane değil zoom belirler
    // (bkz. networkLayers.ts LEGEND_MIN_ZOOM) — kullanıcı katmanı kapatmadıkça kaybolmaz.
    // `none` sentinel'i "hepsi kapalı"yı temsil eder — boş string varsayılana düşerdi.
    if (raw === null) return new Set<LegendId>(LEGEND_IDS);
    if (raw === NO_LAYERS) return new Set<LegendId>();
    return new Set(raw.split(',').filter((v): v is LegendId => (LEGEND_IDS as readonly string[]).includes(v)));
  }, [params]);

  const voltageLevels = useMemo<Set<VoltageLevel>>(() => {
    const raw = params.get('voltage');
    if (!raw) return new Set(VOLTAGE_LEVELS);
    return new Set(raw.split(',').filter((v): v is VoltageLevel => (VOLTAGE_LEVELS as readonly string[]).includes(v)));
  }, [params]);

  const showAdminBoundaries = params.get('boundaries') !== '0';
  const selectedId = params.get('selected') ?? undefined;
  const focusId = params.get('focus') ?? undefined;

  const view = useMemo<MapView>(() => {
    const lngRaw = params.get('lng');
    const latRaw = params.get('lat');
    const zoomRaw = params.get('zoom');
    // `Number(null) === 0` — parametre hiç yoksa `Number()` sessizce 0'a düşer ve
    // `Number.isFinite` bunu geçerli sanır, DEFAULT_VIEW'e hiç düşülmez. Önce varlığı kontrol edilir.
    if (lngRaw === null || latRaw === null || zoomRaw === null) return DEFAULT_VIEW;
    const lng = Number(lngRaw);
    const lat = Number(latRaw);
    const zoom = Number(zoomRaw);
    if (Number.isFinite(lng) && Number.isFinite(lat) && Number.isFinite(zoom)) return { lng, lat, zoom };
    return DEFAULT_VIEW;
  }, [params]);

  const patch = useCallback(
    (next: Record<string, string | undefined>) => {
      setParams(
        (prev) => {
          const merged = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(next)) {
            if (value === undefined) merged.delete(key);
            else merged.set(key, value);
          }
          return merged;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const toggleLegend = useCallback(
    (id: LegendId) => {
      const next = new Set(legend);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      patch({ layers: next.size === 0 ? NO_LAYERS : Array.from(next).join(',') });
    },
    [legend, patch],
  );

  const toggleVoltageLevel = useCallback(
    (level: VoltageLevel) => {
      const next = new Set(voltageLevels);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      patch({ voltage: next.size === VOLTAGE_LEVELS.length ? undefined : Array.from(next).join(',') });
    },
    [voltageLevels, patch],
  );

  const setShowAdminBoundaries = useCallback((value: boolean) => patch({ boundaries: value ? undefined : '0' }), [patch]);
  const setSelectedId = useCallback((id: string | undefined) => patch({ selected: id }), [patch]);
  const clearFocus = useCallback(() => patch({ focus: undefined }), [patch]);

  const setView = useCallback(
    (next: MapView) => patch({ lng: next.lng.toFixed(5), lat: next.lat.toFixed(5), zoom: next.zoom.toFixed(2) }),
    [patch],
  );

  return {
    view,
    setView,
    legend,
    toggleLegend,
    voltageLevels,
    toggleVoltageLevel,
    showAdminBoundaries,
    setShowAdminBoundaries,
    selectedId,
    setSelectedId,
    focusId,
    clearFocus,
  };
}
