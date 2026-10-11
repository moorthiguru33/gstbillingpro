import { useEffect, useState } from 'react';

const Q = '(max-width: 768px)';
const match = () => { try { return window.matchMedia(Q).matches; } catch { return false; } };

/** True on phone-width screens (same breakpoint as mobile.css). */
export default function useIsPhone() {
  const [phone, setPhone] = useState(match);
  useEffect(() => {
    let mq;
    try { mq = window.matchMedia(Q); } catch { return undefined; }
    const on = () => setPhone(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return phone;
}
