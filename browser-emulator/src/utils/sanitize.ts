export function sanitizeFilename(input: string): string {
	return input.replace(/[^a-zA-Z0-9_.-]/g, '_');
}

/** Flag names whose following argument value must never reach logs. */
const SECRET_CLI_FLAGS = new Set(['--api-key', '--api-secret']);

/**
 * Redacts the value following any {@link SECRET_CLI_FLAGS} in a CLI argument
 * list, for safe inclusion in logs (e.g. `lk load-test --api-secret <redacted>`).
 */
export function redactSecretCliArgs(args: readonly string[]): string[] {
	return args.map((arg, index) =>
		index > 0 && SECRET_CLI_FLAGS.has(args[index - 1]) ? '<redacted>' : arg,
	);
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
