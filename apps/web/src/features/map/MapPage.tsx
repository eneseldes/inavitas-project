import { useEffect, useState } from 'react';
import { DetailPanel } from './DetailPanel.tsx';
import { MapView } from './MapView.tsx';
import { ModePanel } from './ModePanel.tsx';
import { useMapState } from './useMapState.ts';
import { useComponent } from './useNetwork.ts';
import styles from './MapPage.module.scss';

/** `/map` — sol panel (seçim özeti), harita, sağ panel (katmanlar ve filtreler). */
export function MapPage() {
  const {
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
  } = useMapState();
  const [isModePanelExpanded, setIsModePanelExpanded] = useState(true);
  const { data: focusComponent } = useComponent(focusId);

  useEffect(() => {
    if (!focusComponent) return;
    setSelectedId(focusComponent.id);
    clearFocus();
    // Yalnız dışarıdan gelen `focus` id'si değişince tetiklenir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusComponent]);

  const flyTo =
    focusComponent && focusComponent.lat !== null && focusComponent.lon !== null
      ? { lng: focusComponent.lon, lat: focusComponent.lat, zoom: view.zoom }
      : undefined;

  return (
    <div className={styles.page}>
      <DetailPanel selectedId={selectedId} onClose={() => setSelectedId(undefined)} />

      <div className={styles.mapArea}>
        <MapView
          view={view}
          onViewChange={setView}
          legend={legend}
          voltageLevels={voltageLevels}
          showAdminBoundaries={showAdminBoundaries}
          selectedId={selectedId}
          onSelect={setSelectedId}
          flyTo={flyTo}
        />
      </div>

      <ModePanel
        isExpanded={isModePanelExpanded}
        onToggleExpanded={() => setIsModePanelExpanded((prev) => !prev)}
        legend={legend}
        onToggleLegend={toggleLegend}
        voltageLevels={voltageLevels}
        onToggleVoltageLevel={toggleVoltageLevel}
        showAdminBoundaries={showAdminBoundaries}
        onShowAdminBoundariesChange={setShowAdminBoundaries}
      />
    </div>
  );
}
