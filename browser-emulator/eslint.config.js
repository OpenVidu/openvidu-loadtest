import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import importPlugin from 'eslint-plugin-import';
import prettierPlugin from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';

export default [
	{
		ignores: [
			'node_modules/',
			'dist/',
			'*.config.*',
			'public/',
			'public-lk/',
			'recordings/',
		],
	},
	{
		files: ['src/**/*.ts', '*.ts', '*.js', 'tests/**/*.ts'],
		languageOptions: {
			parser: tsParser,
			parserOptions: {
				ecmaVersion: 'latest',
				sourceType: 'module',
				project: './tsconfig.json',
			},
			globals: {
				console: 'readonly',
				process: 'readonly',
				Buffer: 'readonly',
			},
		},
		plugins: {
			'@typescript-eslint': tsPlugin,
			import: importPlugin,
			prettier: prettierPlugin,
		},
		settings: {
			'import/resolver': {
				typescript: {
					alwaysTryTypes: true,
					project: './tsconfig.json',
				},
			},
		},
		rules: {
			// CRITICAL: Enforce .js extensions for ESM imports (catches the Node.js runtime error)
			'import/extensions': [
				'error',
				'ignorePackages',
				{
					ts: 'never',
					tsx: 'never',
				},
			],
			'import/no-unresolved': 'error',

			// Helpful TypeScript rules
			'@typescript-eslint/no-unused-vars': [
				'warn',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
				},
			],
			'@typescript-eslint/no-explicit-any': 'warn',

			// Prettier integration
			'prettier/prettier': 'error',
			...prettierConfig.rules,
		},
	},
	{
		files: ['tests/**/*.ts'],
		languageOptions: {
			parser: tsParser,
			parserOptions: {
				ecmaVersion: 'latest',
				sourceType: 'module',
				project: './tsconfig.json',
			},
			globals: {
				describe: 'readonly',
				it: 'readonly',
				expect: 'readonly',
				beforeEach: 'readonly',
				afterEach: 'readonly',
				beforeAll: 'readonly',
				afterAll: 'readonly',
				jest: 'readonly',
			},
		},
		plugins: {
			'@typescript-eslint': tsPlugin,
			import: importPlugin,
			prettier: prettierPlugin,
		},
		settings: {
			'import/resolver': {
				typescript: {
					alwaysTryTypes: true,
					project: './tsconfig.json',
				},
			},
		},
		rules: {
			'import/extensions': [
				'error',
				'ignorePackages',
				{
					ts: 'never',
					tsx: 'never',
				},
			],
			'import/no-unresolved': 'error',
			'@typescript-eslint/no-explicit-any': 'warn',

			// Prettier integration
			'prettier/prettier': 'warn',
			...prettierConfig.rules,
		},
	},
];
