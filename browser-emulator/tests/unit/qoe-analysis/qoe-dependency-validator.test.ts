import { describe, expect, it, vi } from 'vitest';
import { validateQoeDependencies } from '../../../src/services/qoe-analysis/qoe-dependency-validator.ts';

describe('qoe-dependency-validator', () => {
	it('checks base dependencies when allAnalysis is false', async () => {
		const runner = {
			runAndCapture: vi.fn(() => Promise.resolve('')),
		};

		await validateQoeDependencies(runner as never, false);

		expect(runner.runAndCapture).toHaveBeenCalledTimes(4);
		expect(runner.runAndCapture).toHaveBeenCalledWith('which vmaf');
		expect(runner.runAndCapture).toHaveBeenCalledWith('which visqol');
		expect(runner.runAndCapture).toHaveBeenCalledWith('which ffmpeg');
		expect(runner.runAndCapture).toHaveBeenCalledWith('which tesseract');
	});

	it('checks extra dependencies when allAnalysis is true', async () => {
		const runner = {
			runAndCapture: vi.fn(() => Promise.resolve('')),
		};

		await validateQoeDependencies(runner as never, true);

		expect(runner.runAndCapture).toHaveBeenCalledTimes(6);
		expect(runner.runAndCapture).toHaveBeenCalledWith('which vqmt');
		expect(runner.runAndCapture).toHaveBeenCalledWith('which pesq');
	});

	it('fails when mandatory tesseract dependency is missing', async () => {
		const runner = {
			runAndCapture: vi.fn((command: string) => {
				if (command === 'which tesseract') {
					return Promise.reject(new Error('not found'));
				}
				return Promise.resolve('');
			}),
		};

		await expect(
			validateQoeDependencies(runner as never, false),
		).rejects.toThrow('not found');
	});
});
