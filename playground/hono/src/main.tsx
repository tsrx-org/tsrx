import { createRoot } from 'hono/jsx/dom/client';
import { App } from './App.tsrx';

const target = document.getElementById('root');
if (!target) throw new Error('#root not found');

createRoot(target).render(<App />);
