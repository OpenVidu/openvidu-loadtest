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
				extends: true,
				test: {
					name: 'integration',
					include: ['tests/integration/**/**.test.ts'],
					testTimeout: 600000, // 10 minutes for container startup and file operations
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
