import { Counter, type CounterProps } from './Counter.tsrx';

export const component = Counter;
// Intentional cross-file prop-type error: `start` must be a number.
export const bad: CounterProps = { start: 'one', label: 'Clicks' };
