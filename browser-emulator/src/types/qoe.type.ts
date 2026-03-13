import type { Request, Response } from 'express';

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
}

export interface QoeAnalysisStatusResponse extends Response {
	body: QoeAnalysisStatus;
}

export interface QoeAnalysisStatus {
	remainingFiles: number;
}
