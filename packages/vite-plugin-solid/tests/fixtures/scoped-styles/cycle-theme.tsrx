import { AppliedPanel } from './cycle-applier.tsrx';

export const theme = <style>
	div {
		color: rgb(255, 0, 0);
	}
</style>;

export function CycleHost() @{
	<AppliedPanel />
}
