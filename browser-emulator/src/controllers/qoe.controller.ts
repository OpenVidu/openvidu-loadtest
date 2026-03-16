import * as express from 'express';
import multer from 'multer';
import type { Request, Response } from 'express';
import fs from 'node:fs';
import type { QoeAnalysisOrchestratorService } from '../services/qoe-analysis/qoe-analysis-orchestrator.service.ts';
import { LocalFilesRepository } from '../repositories/files/local-files.repository.ts';
import type { QoeAnalysisRequest } from '../types/qoe.type.ts';

interface QoeRecordingRequest extends Request {
	file: Express.Multer.File;
}

export class QoeController {
	private readonly router: express.Router;
	private readonly qoeAnalysisOrchestratorService: QoeAnalysisOrchestratorService;
	private readonly upload = multer({ storage: multer.memoryStorage() });

	constructor(
		qoeAnalysisOrchestratorService: QoeAnalysisOrchestratorService,
	) {
		this.qoeAnalysisOrchestratorService = qoeAnalysisOrchestratorService;
		this.router = express.Router({ strict: true });
		this.setupRoutes();
	}

	private setupRoutes(): void {
		// Used by browser to upload recordings to browseremulator's file system
		this.router.post(
			'/qoeRecordings',
			this.upload.single('file'),
			this.handleQoeRecordingsUpload.bind(this) as express.RequestHandler,
		);
		this.router.post('/analysis', this.handleAnalysis.bind(this));
		this.router.get(
			'/analysis/status',
			this.handleAnalysisStatus.bind(this),
		);
	}

	/*
	 * This endpoint is used to upload QoE recordings from the browser to the browser emulator's file system.
	 * The recordings are sent in chunks, so this endpoint appends the received chunk to the corresponding file in the file system.
	 * The file is stored in the QOE_RECORDING_DIR directory with the original name of the uploaded file.
	 */
	private handleQoeRecordingsUpload(
		req: QoeRecordingRequest,
		res: Response,
	): void {
		if (!req.file) {
			res.status(400).send('No file uploaded');
			return;
		}
		const buffer = req.file.buffer;

		fs.appendFile(
			`${LocalFilesRepository.QOE_RECORDING_DIR}/${req.file.originalname}`,
			new Uint8Array(buffer),
			err => {
				if (err) {
					res.status(500).send(err.message);
				} else {
					res.status(200).send();
				}
			},
		);
	}

	private async handleAnalysis(
		req: QoeAnalysisRequest,
		res: Response,
	): Promise<void> {
		const status = await this.qoeAnalysisOrchestratorService.runQoEAnalysis(
			req.body.fragmentDuration,
			req.body.paddingDuration,
			req.body.presenterVideoProperties?.width,
			req.body.presenterVideoProperties?.height,
			req.body.presenterVideoProperties?.frameRate,
			req.body.qoeConfig,
		);
		res.status(200).send(status);
	}

	private handleAnalysisStatus(_req: Request, res: Response): void {
		res.status(200).json({
			remainingFiles:
				this.qoeAnalysisOrchestratorService.getRemainingFiles(),
		});
	}

	public getRouter(): express.Router {
		return this.router;
	}
}
