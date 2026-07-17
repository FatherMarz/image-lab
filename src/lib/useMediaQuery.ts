import { useEffect, useState } from "react";

/**
 * Reactive `matchMedia`. Used to pick the desktop 3-column layout vs the mobile
 * single-column one in App — a JS switch rather than CSS `hidden`, so each panel
 * (palette extract, format detection, EXIF read) mounts exactly once.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
