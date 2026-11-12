// Editor-only `import.meta.env.platform` types for a project without a platform.
// The content mapper references this file in place of the copy that
// `withPlatformTypes` in `@tsrx/core` appends to each module that keeps a
// flag (see `src/platform-globals.js`).
export {};
declare global {
	interface ImportMetaEnv {
		readonly platform: string & {
			readonly web: boolean;
			readonly ios: boolean;
			readonly android: boolean;
		};
	}
	interface ImportMeta {
		readonly [key: `env${string}`]: ImportMetaEnv;
	}
}
