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
					setupFiles: ['tests/setup/unit/globalFsSetup.ts'],
				},
			},
			{
				extends: true,
				test: {
					name: 'e2e',
					include: ['tests/e2e/**/*.test.ts'],
					testTimeout: 300000, // 5 minutes, because some tests may involve starting a browser and that can take some time
					sequence: {
						concurrent: false,
					},
					fileParallelism: false,
				},
			},
		],
	},
});
