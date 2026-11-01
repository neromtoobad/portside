// A few pages don't need a router library: paths live in the History API and links push to it.
import { useEffect, useState, type AnchorHTMLAttributes } from 'react';

const listeners = new Set<() => void>();
/** Keeps ?mock (and ?fast) across pages while designing offline. */
const keep = () => (new URLSearchParams(location.search).has('mock') ? location.search : '');

export function navigate(to: string) {
  history.pushState(null, '', to + keep());
  listeners.forEach((f) => f());
  window.scrollTo(0, 0);
}

export function usePath() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const f = () => setPath(location.pathname);
    listeners.add(f);
    window.addEventListener('popstate', f);
    return () => { listeners.delete(f); window.removeEventListener('popstate', f); };
  }, []);
  return path;
}

export function Link({ to, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  return (
    <a
      href={to + keep()}
      {...rest}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(to);
      }}
    />
  );
}
