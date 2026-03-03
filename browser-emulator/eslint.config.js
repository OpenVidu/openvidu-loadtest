import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';
import prettierPlugin from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier/flat';

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
	js.configs.recommended,
	...tseslint.configs.recommendedTypeChecked,
	...tseslint.configs.stylisticTypeChecked,
	{
		files: ['src/**/*.ts', '*.ts', '*.js'],
		languageOptions: {
			parser: tseslint.parser,
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
			...importPlugin.configs.recommended.rules,
			...importPlugin.configs.typescript.rules,
			...prettierPlugin.configs.recommended.rules,
			...prettierConfig.rules,
		},
	},
	{
		files: ['tests/**/*.ts'],
		languageOptions: {
			parser: tseslint.parser,
			parserOptions: {
				ecmaVersion: 'latest',
				sourceType: 'module',
				project: './tsconfig.test.json',
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
			import: importPlugin,
			prettier: prettierPlugin,
		},
		settings: {
			'import/resolver': {
				typescript: {
					alwaysTryTypes: true,
					project: './tsconfig.test.json',
				},
			},
		},
		rules: {
			...importPlugin.configs.recommended.rules,
			...importPlugin.configs.typescript.rules,
			...prettierPlugin.configs.recommended.rules,
			...prettierConfig.rules,
			'@typescript-eslint/no-unsafe-assignment': 'off',
		},
	},
	{
		files: ['dev_scripts/**/*.ts'],
		languageOptions: {
			parser: tseslint.parser,
			parserOptions: {
				ecmaVersion: 'latest',
				sourceType: 'module',
				project: './tsconfig.dev_scripts.json',
			},
			globals: {
				console: 'readonly',
				process: 'readonly',
				Buffer: 'readonly',
			},
		},
		plugins: {
			import: importPlugin,
			prettier: prettierPlugin,
		},
		settings: {
			'import/resolver': {
				typescript: {
					alwaysTryTypes: true,
					project: './tsconfig.dev_scripts.json',
				},
			},
		},
		rules: {
			...importPlugin.configs.recommended.rules,
			...importPlugin.configs.typescript.rules,
			...prettierPlugin.configs.recommended.rules,
			...prettierConfig.rules,
		},
	},
];
