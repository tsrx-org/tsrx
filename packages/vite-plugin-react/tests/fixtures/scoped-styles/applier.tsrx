import { theme } from './theme.tsrx';

export function AppliedPanel() @{
	<>
		<style apply={theme}>
			div {
				--tsrx-applier-mark: applier;
				color: rgb(0, 0, 0);
			}
		</style>
		<div className="probe" data-probe="applied">{'local wins'}</div>
	</>
}

export function ThemeApplyApp() @{
	<>
		<AppliedPanel />
		<div className={theme.$class} data-probe="opt-in">{'opted in'}</div>
		<div data-probe="untouched">{'untouched'}</div>
	</>
}

export { theme };
