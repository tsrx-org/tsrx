export function ImportedAsync(): Promise<string> {
	return Promise.resolve('async');
}

export function ImportedSync(): string {
	return 'sync';
}

export function MixedOverload(): string;
export function MixedOverload(): Promise<string>;
export function MixedOverload(): string | Promise<string> {
	return Math.random() > 0.5 ? 'sync' : Promise.resolve('async');
}

export const Broad = (): string | Promise<string> => 'broad';
export const UnionResult: (() => string) | (() => Promise<string>) = () => 'union';
export const AnyComponent: any = () => Promise.resolve('any');
export const UnknownComponent: unknown = () => Promise.resolve('unknown');
export const Components: {
	MaybeAsync: () => string | Promise<string>;
} = {
	MaybeAsync: () => 'member',
};

export function Generic<T>(): T {
	throw new Error('generic');
}
