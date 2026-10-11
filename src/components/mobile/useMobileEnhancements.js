import { useEffect } from 'react';

// Phone-only DOM helpers that would otherwise need edits in every screen:
//  * wide data tables get `data-label`s so CSS can render each row as a card
//  * number / phone inputs ask for the numeric keypad
export default function useMobileEnhancements() {
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    let raf = 0;
    const run = () => {
      if (!mq.matches) return;
      document.querySelectorAll('.main-content table').forEach((t) => {
        if (t.closest('.no-mcards, .preview-pane, .modal-content, .invoice-preview, .msheet')) return;
        const ths = t.querySelectorAll('thead th');
        if (!ths.length) return;
        const heads = [];
        ths.forEach((th) => { const n = th.colSpan || 1; for (let i = 0; i < n; i++) heads.push(th.textContent.trim()); });
        t.classList.add('mcards');
        t.querySelectorAll('tbody tr').forEach((tr) => {
          let col = 0;
          for (const td of tr.children) {
            if (!td.hasAttribute('data-label')) td.setAttribute('data-label', heads[col] || '');
            col += td.colSpan || 1;
          }
        });
      });
      document.querySelectorAll('input[type="number"]:not([inputmode])').forEach((el) => {
        el.setAttribute('inputmode', 'decimal');
      });
      document.querySelectorAll('input[type="tel"]:not([inputmode])').forEach((el) => el.setAttribute('inputmode', 'tel'));
    };
    const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(run); };
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true });
    mq.addEventListener?.('change', schedule);
    schedule();
    return () => { mo.disconnect(); cancelAnimationFrame(raf); mq.removeEventListener?.('change', schedule); };
  }, []);
}
