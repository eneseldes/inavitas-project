import type { ReactNode } from 'react';
import { FiCrosshair, FiFilter, FiLayers } from 'react-icons/fi';
import { clsx } from 'clsx';
import { useTranslation } from '../i18n/I18nProvider.tsx';
import styles from './MapToolRail.module.scss';

/** Sağ şeritten açılabilen paneller. `undefined` = hepsi kapalı. */
export type MapTool = 'layers' | 'filters' | 'area';

// Alan seçimi bir hedef işaretlemesidir — "kırp" değil "nişan al" ikonu bu anlamı
// daha iyi taşır. Aynı ikon eskiden ayrı duran "görünümü sıfırla" düğmesindeydi;
// o düğme kaldırılınca (bkz. MapPage.tsx) ikonu burada devam ediyor.
const TOOLS: { id: MapTool; icon: typeof FiLayers; labelKey: string }[] = [
  { id: 'layers', icon: FiLayers, labelKey: 'map.tool.layers' },
  { id: 'filters', icon: FiFilter, labelKey: 'map.tool.filters' },
  { id: 'area', icon: FiCrosshair, labelKey: 'map.tool.area' },
];

interface MapToolRailProps {
  activeTool: MapTool | undefined;
  onToggleTool: (tool: MapTool) => void;
}

/**
 * Haritanın sağ kenarındaki dikey araç şeridi. Her düğme bir paneli açıp kapatır; aynı
 * anda yalnız biri açıktır, çünkü paneller aynı yeri paylaşır.
 *
 * Etiketler yalnız üzerine gelince ipucu olarak görünür: şerit dar kalmalı, harita alanını
 * yemeye başladığı anda amacını kaybeder.
 */
export function MapToolRail({ activeTool, onToggleTool }: MapToolRailProps) {
  const { t } = useTranslation();

  return (
    <div className={styles.rail}>
      {TOOLS.map((tool) => (
        <RailButton
          key={tool.id}
          label={t(tool.labelKey)}
          isActive={activeTool === tool.id}
          onClick={() => onToggleTool(tool.id)}
        >
          <tool.icon />
        </RailButton>
      ))}
    </div>
  );
}

function RailButton({
  label,
  isActive,
  onClick,
  children,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <span className={styles.slot}>
      <button
        type="button"
        className={clsx('icon-btn', isActive && 'icon-btn--active', styles.button)}
        aria-label={label}
        aria-pressed={isActive}
        onClick={(e) => {
          // Tıklama sonrası odak düğmede kalır; `:focus-within` ipucuyu açık tutmaya devam
          // eder, fare uzaklaşsa bile. Odağı bırakmak ipucunun fare ile aynı anda kapanmasını sağlar.
          e.currentTarget.blur();
          onClick();
        }}
      >
        {children}
      </button>
      <span className={styles.tooltip} role="tooltip">
        {label}
      </span>
    </span>
  );
}
