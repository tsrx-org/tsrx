import { Counter } from './Counter.tsrx';

export const good = Counter({ start: 1 });
// Intentional cross-file prop-type error: `start` must be a number.
export const bad = Counter({ start: 'one', label: 'Clicks' });
