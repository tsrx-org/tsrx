import Button from './Button.tsrx';
import Panel from './Panel.tsrx';

export const panel = Panel({ title: 'Hello', count: 1 });
export const button = Button({ label: 'Go' });
// Intentional cross-file prop-type error: `count` must be a number.
export const broken = Panel({ title: 'Hello', count: 'one' });
