// The module whose property `assigned-import-member-components.tsrx` assigns
// (#1292). Its `Button` renders plain text, so it reads the same on every
// target.

/** @type {{ Button: (props: object) => unknown }} */
const ui = {
	Button: () => 'original',
};

export default ui;
