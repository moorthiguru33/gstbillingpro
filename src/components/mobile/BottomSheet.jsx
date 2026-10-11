import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { t as tr } from '../../i18n';

// Phone-style sheet that slides up from the bottom. Esc / backdrop closes it.
export default function BottomSheet({ title, onClose, children, className = '' }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  // Portal to <body> so a transformed / stacking-context parent (the invoice
  // editor, POS) can never paint its sticky action bar over the sheet.
  return createPortal(
    <div className="msheet-backdrop" onClick={onClose}>
      <div className={`msheet ${className}`} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="msheet-grip" aria-hidden="true" />
        <div className="msheet-head">
          <h3>{title}</h3>
          <button type="button" className="msheet-close" onClick={onClose} aria-label={tr('common.close')}><X size={22} /></button>
        </div>
        <div className="msheet-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
