import type { Request } from 'express';

export interface QoeAnalysisRequest extends Request {
	body: QoeAnalysis;
}

export interface QoeAnalysis {
	fragmentDuration: number;
	paddingDuration: number;
}
