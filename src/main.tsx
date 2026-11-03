import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';


// Block page-level rubber-banding / pinch-zoom, but let real scroll areas (lists, card grids,
// tall menu screens) scroll by touch. Gameplay canvases use touch-action:none and handle their own input.
const isField = (t: EventTarget | null) => t instanceof HTMLElement && !!t.closest('input, textarea, select');
function insideScrollable(t: EventTarget | null): boolean {
  let el = t instanceof Element ? (t as HTMLElement) : null;
  while (el && el !== document.body) {
    const cs = getComputedStyle(el);
    if (cs.touchAction === 'none') return false;
    const canY = /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1;
    const canX = /(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1;
    if (canY || canX) return true;
    el = el.parentElement;
  }
  return false;
}
document.addEventListener(
  'touchmove',
  (e) => {
    if (e.touches.length > 1) {
      if (e.cancelable) e.preventDefault(); // no pinch-zoom
      return;
    }
    if (isField(e.target) || insideScrollable(e.target)) return;
    if (e.cancelable) e.preventDefault();
  },
  { passive: false },
);
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => {
  if (!isField(e.target)) e.preventDefault();
});

createRoot(document.getElementById('root')!).render(<App />);
