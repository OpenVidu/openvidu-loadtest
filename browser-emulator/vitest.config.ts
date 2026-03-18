import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'html'],
			include: ['src/**/*.ts'],
		},
		projects: [
			{
				extends: true,
				test: {
					name: 'unit',
					include: ['tests/unit/**/*.test.ts'],
					setupFiles: ['tests/setup/unit/global-fs-setup.ts'],
				},
			},
			{
				// These integration tests don't require to be running in an ubuntu instance
				// with software package dependencies from install scripts installed,
				// just docker
				extends: true,
				test: {
					name: 'integration-generic',
					include: ['tests/integration-generic/**/**.test.ts'],
					testTimeout: 600000, // 10 minutes for container startup and file operations
				},
			},
			{
				// These integration tests require to be running in an ubuntu instance
				// with software package dependencies from install scripts installed
				extends: true,
				test: {
					name: 'integration-native',
					include: ['tests/integration-native/**/**.test.ts'],
					testTimeout: 600000, // 10 minutes for container startup and file operations
					sequence: {
						concurrent: false,
					},
					fileParallelism: false,
				},
			},
			{
				extends: true,
				test: {
					name: 'e2e-legacy',
					include: ['tests/e2e/**/*.test.ts'],
					testTimeout: 600000, // 10 minutes
					sequence: {
						concurrent: false,
					},
					fileParallelism: false,
				},
			},
			{
				extends: true,
				test: {
					name: 'e2e',
					include: ['tests/e2e/**/*.test.ts'],
					testTimeout: 600000, // 10 minutes
					sequence: {
						concurrent: false,
					},
					fileParallelism: false,
				},
			},
		],
	},
});
