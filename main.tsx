import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

// Block page-level scroll / rubber-banding / pinch-zoom everywhere except form fields.
const isField = (t: EventTarget | null) => t instanceof HTMLElement && !!t.closest('input, textarea, select');
document.addEventListener(
  'touchmove',
  (e) => {
    if (!isField(e.target) && e.cancelable) e.preventDefault();
  },
  { passive: false },
);
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => {
  if (!isField(e.target)) e.preventDefault();
});

createRoot(document.getElementById('root')!).render(<App />);
