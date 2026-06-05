export function sanitizeFilename(input: string): string {
	return input.replace(/[^a-zA-Z0-9_.-]/g, '_');
}

export function sanitizePathSegment(input: string): string {
	return input.replace(/[^a-zA-Z0-9_-]/g, '_');
}
