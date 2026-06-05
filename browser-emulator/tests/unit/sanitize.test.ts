import { describe, expect, it } from 'vitest';
import {
	sanitizeFilename,
	sanitizePathSegment,
	validateUrl,
} from '../../src/utils/sanitize.js';

describe('sanitizeFilename', () => {
	it('should allow alphanumeric characters', () => {
		expect(sanitizeFilename('abc123')).toBe('abc123');
	});

	it('should allow dots, hyphens, underscores', () => {
		expect(sanitizeFilename('test-file.name_v2')).toBe('test-file.name_v2');
	});

	it('should replace invalid characters with underscores', () => {
		expect(sanitizeFilename('a/b*c<d>e')).toBe('a_b_c_d_e');
	});

	it('should handle empty string', () => {
		expect(sanitizeFilename('')).toBe('');
	});
});

describe('sanitizePathSegment', () => {
	it('should allow alphanumeric, hyphens, underscores', () => {
		expect(sanitizePathSegment('hello-world_123')).toBe('hello-world_123');
	});

	it('should strip dots', () => {
		expect(sanitizePathSegment('file.name')).toBe('file_name');
	});

	it('should replace invalid characters', () => {
		expect(sanitizePathSegment('a/b@c!')).toBe('a_b_c_');
	});
});

describe('validateUrl', () => {
	it('should accept valid https URL', () => {
		const result = validateUrl('https://example.com/file.y4m');
		expect(result).toBeInstanceOf(URL);
		expect(result.hostname).toBe('example.com');
	});

	it('should accept valid http URL', () => {
		const result = validateUrl('http://example.com/file.y4m');
		expect(result).toBeInstanceOf(URL);
		expect(result.hostname).toBe('example.com');
	});

	it('should accept S3 URL', () => {
		const url =
			'https://openvidu-loadtest-mediafiles.s3.us-east-1.amazonaws.com/bunny_720p_30fps.y4m';
		const result = validateUrl(url);
		expect(result.hostname).toBe(
			'openvidu-loadtest-mediafiles.s3.us-east-1.amazonaws.com',
		);
	});

	it('should reject ftp protocol', () => {
		expect(() => validateUrl('ftp://example.com/file')).toThrow(
			'Invalid protocol',
		);
	});

	it('should reject file protocol', () => {
		expect(() => validateUrl('file:///etc/passwd')).toThrow(
			'Invalid protocol',
		);
	});

	it('should reject localhost', () => {
		expect(() => validateUrl('http://localhost:9200')).toThrow(
			'URL hostname not allowed',
		);
	});

	it('should reject 127.0.0.1', () => {
		expect(() => validateUrl('http://127.0.0.1:9200')).toThrow(
			'URL hostname not allowed',
		);
	});

	it('should reject 0.0.0.0', () => {
		expect(() => validateUrl('http://0.0.0.0:8080')).toThrow(
			'URL hostname not allowed',
		);
	});

	it('should reject private 10.x.x.x', () => {
		expect(() => validateUrl('http://10.0.0.1/latest/meta-data/')).toThrow(
			'URL hostname not allowed',
		);
	});

	it('should reject private 192.168.x.x', () => {
		expect(() => validateUrl('http://192.168.1.1/admin')).toThrow(
			'URL hostname not allowed',
		);
	});

	it('should reject private 172.16-31.x.x', () => {
		expect(() => validateUrl('http://172.16.0.1/config')).toThrow(
			'URL hostname not allowed',
		);
		expect(() => validateUrl('http://172.31.0.1/config')).toThrow(
			'URL hostname not allowed',
		);
	});

	it('should reject .local TLD', () => {
		expect(() => validateUrl('http://my-service.local/api')).toThrow(
			'URL hostname not allowed',
		);
	});

	it('should reject .internal TLD', () => {
		expect(() => validateUrl('http://db.internal/admin')).toThrow(
			'URL hostname not allowed',
		);
	});

	it('should accept public IP addresses', () => {
		const result = validateUrl('http://93.184.216.34/path');
		expect(result.hostname).toBe('93.184.216.34');
	});

	it('should reject invalid URL', () => {
		expect(() => validateUrl('not-a-url')).toThrow();
	});

	it('should reject custom video URL pointing to internal service', () => {
		expect(() =>
			validateUrl('http://169.254.169.254/latest/meta-data/'),
		).toThrow('URL hostname not allowed');
	});
});
