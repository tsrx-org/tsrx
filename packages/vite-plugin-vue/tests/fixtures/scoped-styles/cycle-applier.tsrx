import { theme } from './cycle-theme.tsrx';

// Module-scope apply reads theme.$class during evaluation. If this module
// runs first, `theme` is still in the TDZ (D13 layer 3).
export const applied = <style apply={theme} />;

export function AppliedPanel() @{
	<>
		<style apply={theme} />
		<div>{'cycle'}</div>
	</>
}
