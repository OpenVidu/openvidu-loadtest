export function sanitizeFilename(input: string): string {
	return input.replace(/[^a-zA-Z0-9_.-]/g, '_');
}

export function sanitizePathSegment(input: string): string {
	return input.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export function validateUrl(url: string): URL {
	const parsed = new URL(url);
	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
		throw new Error(`Invalid protocol: ${parsed.protocol}`);
	}
	const hostname = parsed.hostname.toLowerCase();
	if (
		hostname === 'localhost' ||
		hostname === '127.0.0.1' ||
		hostname === '0.0.0.0' ||
		hostname === '[::1]' ||
		hostname.startsWith('10.') ||
		hostname.startsWith('192.168.') ||
		hostname.startsWith('169.254.') ||
		/^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
		hostname.endsWith('.local') ||
		hostname.endsWith('.internal')
	) {
		throw new Error(`URL hostname not allowed: ${hostname}`);
	}
	return parsed;
}
