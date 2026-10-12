import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Scroll where the URL says, on client-side navigation.
 *
 * The browser only honours a #hash when it loads a document. React
 * Router changes the URL without one, so "See full details" ->
 * /packages#PKG-LAUNCH-KIT changed the address bar, rendered the right
 * page, and left the viewport wherever it already was -- which, coming
 * from the packages section near the bottom of the home page, clamped to
 * the bottom of the new page. All three buttons landed on the same spot,
 * none of them the package that was clicked. It reads as a broken
 * button, and it was reported as one.
 *
 * The element does not exist on the first frame after navigation, so one
 * animation frame is given for React to commit before looking for it.
 */
export function ScrollToHash() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (!hash) {
      window.scrollTo(0, 0);
      return;
    }

    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      if (cancelled) return;
      // A hash is attacker-supplied in principle, so it is looked up with
      // getElementById rather than interpolated into a selector.
      const target = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      else window.scrollTo(0, 0);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [pathname, hash]);

  return null;
}
