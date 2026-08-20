import { FiLink } from 'react-icons/fi';

interface RecordLinkProps {
  /** Kayıt kimliği (uuid) — ekranda ilk 8 hanesi gösterilir. */
  id: string;
  onClick: () => void;
  title?: string;
  /** Tablo hücresinde satır tıklamasının da tetiklenmesini engeller. */
  stopPropagation?: boolean;
}

/**
 * Tıklanabilir kayıt kimliği. Kesinti/iş emri kimliğinin geçtiği her yer bunu kullanır —
 * tablo hücresi, detay bölümü ve harita panelleri aynı görünmelidir.
 */
export function RecordLink({ id, onClick, title, stopPropagation = false }: RecordLinkProps) {
  return (
    <button
      type="button"
      className="link"
      title={title}
      onClick={(e) => {
        if (stopPropagation) e.stopPropagation();
        onClick();
      }}
    >
      <FiLink />
      <span className="font-mono">{id.slice(0, 8)}</span>
    </button>
  );
}
