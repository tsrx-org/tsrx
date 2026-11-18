// Shared runtime fixture for a member tag on an import whose property the
// module assigns (#1292). React, Preact and Hono hoist static JSX to a
// module-level constant, which would read `ui.Button` when the module loads,
// before the assignment below runs. The element must stay at render time, so
// it renders the replacement.
import ui from './assigned-import-member-ui.js';

function Replacement() {
	return <b class="assigned-import-member-replacement">replacement</b>;
}

export function AssignedImportMember() @{
	<div class="assigned-import-member">
		<ui.Button />
	</div>
}

ui.Button = Replacement;
