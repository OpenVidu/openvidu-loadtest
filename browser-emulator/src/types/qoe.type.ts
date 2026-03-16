import type { Request, Response } from 'express';
import type { QoeConfig } from './qoe-analysis/qoe-analysis.types.ts';

export interface QoeAnalysisRequest extends Request {
	body: QoeAnalysis;
}

export interface QoeAnalysis {
	fragmentDuration: number;
	paddingDuration: number;
	presenterVideoProperties?: {
		frameRate: number;
		width: number;
		height: number;
	};
	qoeConfig: QoeConfig;
}

export interface QoeAnalysisStatusResponse extends Response {
	body: QoeAnalysisStatus;
}

export interface QoeAnalysisStatus {
	remainingFiles: number;
}
