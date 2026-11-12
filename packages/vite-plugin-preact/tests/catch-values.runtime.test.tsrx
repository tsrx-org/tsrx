// Kept apart from runtime.test.tsrx, which loads preact/compat. Preact reads
// `.then` on a value thrown while rendering, and compat's Suspense on every
// caught value, so a thrown `null` or `undefined` only reaches a boundary
// unchanged from an effect, and only without compat.
import { act } from 'preact/test-utils';
import { useLayoutEffect, useState } from 'preact/hooks';

function RenderThrower(props: { value: unknown }): never {
	throw props.value;
}

function EffectThrower(props: { value: unknown }) {
	useLayoutEffect(() => {
		throw props.value;
	}, []);
	return null;
}

function ThrownValueApp(props: { value: unknown; inEffect: boolean }) @{
	const [fail, setFail] = useState(true);

	@try {
		@if (!fail) {
			<p class="ok">{'recovered'}</p>
		} @else if (props.inEffect) {
			<EffectThrower value={props.value} />
		} @else {
			<RenderThrower value={props.value} />
		}
	} @catch (err, reset: () => void) {
		<button
			class="reset"
			onClick={() => {
				setFail(false);
				reset();
			}}
		>
			{'caught ' + String(err)}
		</button>
	}
}

async function expect_caught(value: unknown, inEffect: boolean) {
	await render(ThrownValueApp, { value, inEffect });
	expect(container.querySelector('.reset')?.textContent).toBe('caught ' + String(value));

	await act(async () => {
		(container.querySelector('.reset') as HTMLButtonElement).click();
	});
	expect(container.querySelector('.ok')?.textContent).toBe('recovered');
}

describe('@catch with a thrown non-Error value (preact)', () => {
	for (const value of [false, 0, 'boom']) {
		it(`catches ${String(value)} thrown while rendering and recovers via reset`, async () => {
			await expect_caught(value, false);
		});
	}

	for (const value of [null, undefined, false, 0, 'boom']) {
		it(`catches ${String(value)} thrown from an effect and recovers via reset`, async () => {
			await expect_caught(value, true);
		});
	}
});
