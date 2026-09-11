import type { Platform } from './index';

export interface BuildPlatformResolutionOptions {
	/** Project root used to find the nearest tsconfig and referenced projects. */
	root?: string;
	/** Explicit tsconfig path, resolved relative to `root`. */
	tsconfig?: string;
	/** Optional integration override; it must agree with tsconfig when both exist. */
	platform?: Platform;
	/** Name included in actionable errors. */
	integration?: string;
}

export function resolveBuildPlatform(
	options?: BuildPlatformResolutionOptions,
): Platform | undefined;
