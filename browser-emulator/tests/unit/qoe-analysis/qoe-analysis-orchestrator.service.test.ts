import { beforeEach, describe, expect, it, vi } from 'vitest';

const runQoEAnalysisNonBlockingMock = vi.hoisted(() => vi.fn());

vi.mock('../../../src/services/qoe-analysis/qoe-analysis-runner.ts', () => ({
	runQoEAnalysisNonBlocking: runQoEAnalysisNonBlockingMock,
}));

import { QoeAnalysisOrchestratorService } from '../../../src/services/qoe-analysis/qoe-analysis-orchestrator.service.ts';

describe('QoeAnalysisOrchestratorService', () => {
	beforeEach(() => {
		runQoEAnalysisNonBlockingMock.mockReset();
	});

	it('returns not-started message when presenter artifacts are missing', async () => {
		const service = new QoeAnalysisOrchestratorService(
			{ fakeVideoProperties: undefined } as never,
			{ fakevideo: undefined, fakeaudio: undefined } as never,
		);

		const result = await service.runQoEAnalysis(5, 1);

		expect(result).toContain('QoE analysis not started');
		expect(service.getRemainingFiles()).toBe(0);
		expect(runQoEAnalysisNonBlockingMock).not.toHaveBeenCalled();
	});

	it('throws when custom media lacks required dimensions/fps', async () => {
		const service = new QoeAnalysisOrchestratorService(
			{ fakeVideoProperties: undefined } as never,
			{
				fakevideo: '/tmp/presenter.mp4',
				fakeaudio: '/tmp/presenter.wav',
			} as never,
		);

		await expect(service.runQoEAnalysis(5, 1)).rejects.toThrow(
			'Presenter video properties (width, height, framerate) are required when using a custom video file',
		);
	});

	it('starts analysis and tracks remaining files', async () => {
		runQoEAnalysisNonBlockingMock.mockResolvedValue(['a.webm', 'b.webm']);
		const service = new QoeAnalysisOrchestratorService(
			{
				fakeVideoProperties: { fps: 30, width: 640, height: 480 },
			} as never,
			{
				fakevideo: '/tmp/presenter.mp4',
				fakeaudio: '/tmp/presenter.wav',
			} as never,
		);

		const result = await service.runQoEAnalysis(5, 1);

		expect(result).toBe('QoE analysis started');
		expect(service.getRemainingFiles()).toBe(2);
		expect(runQoEAnalysisNonBlockingMock).toHaveBeenCalledTimes(1);
		expect(runQoEAnalysisNonBlockingMock.mock.calls[0][0]).toMatchObject({
			fragment_duration: 5,
			padding_duration: 1,
			framerate: 30,
			width: 640,
			height: 480,
		});
	});
});
