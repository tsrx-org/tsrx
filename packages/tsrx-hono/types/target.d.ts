export type HonoTargetMode = 'server' | 'dom';

export interface HonoTargetEntry {
	readonly compiler: '@tsrx/hono' | '@tsrx/hono/dom';
	readonly jsxImportSource: 'hono/jsx' | 'hono/jsx/dom';
}

export declare const honoTarget: {
	readonly name: 'hono';
	readonly defaultMode: 'server';
	readonly modes: Readonly<Record<HonoTargetMode, Readonly<HonoTargetEntry>>>;
};

export declare function resolveHonoTarget(mode?: HonoTargetMode): Readonly<HonoTargetEntry>;
