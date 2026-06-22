import { createHash } from 'node:crypto';

const IDENTIFIER_PATTERN = /^(\D+)(\d*)$/;

export function shortenIdentifier(
	name: string,
	kind: 'session' | 'user',
): string {
	const match = IDENTIFIER_PATTERN.exec(name);
	const shortPrefix = kind === 'session' ? 's' : 'u';
	if (match?.[2]) {
		return `${shortPrefix}${match[2]}`;
	}
	const hash = createHash('md5').update(name).digest('hex').slice(0, 6);
	return `${shortPrefix}-${hash}`;
}

export function createBoundedId(label: string, maxLength: number): string {
	if (label.length <= maxLength) {
		return label;
	}
	const hash = createHash('md5').update(label).digest('hex').slice(0, 6);
	return `${label.slice(0, maxLength - hash.length - 1)}-${hash}`;
}
