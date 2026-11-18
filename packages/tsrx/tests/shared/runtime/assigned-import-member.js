import { describe, expect, it } from 'vitest';

/**
 * Checks the `AssignedImportMember` (`assigned-import-member-components.tsrx`)
 * in the container: it renders the replacement its module assigned.
 */
export function expectAssignedImportMember() {
	const root = globalThis.container.querySelector('.assigned-import-member');
	expect(root?.textContent?.trim()).toBe('replacement');
	expect(root?.querySelector('.assigned-import-member-replacement')).not.toBeNull();
}

/**
 * Shared runtime suite for a member tag on an import whose property the
 * module assigns (#1292).
 *
 * @param {{ AssignedImportMember: unknown }} options
 */
export function runAssignedImportMemberRuntimeTests({ AssignedImportMember }) {
	describe('member tag on an import the module assigns a property of at runtime (#1292)', () => {
		it('renders the replacement', async () => {
			await globalThis.render(AssignedImportMember);
			await globalThis.flush?.();
			expectAssignedImportMember();
		});
	});
}
