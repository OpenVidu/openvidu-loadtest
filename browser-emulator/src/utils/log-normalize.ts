/** Strips non-printable control characters and lowercases, for reliable substring/regex log matching. */
export function normalizeContainerLogs(logs: string): string {
	const sanitizedChars = Array.from(logs).filter(char => {
		const code = char.charCodeAt(0);
		return code === 9 || code === 10 || code === 13 || code >= 32;
	});

	return sanitizedChars.join('').toLowerCase();
}
