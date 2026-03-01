import * as express from 'express';
import multer from 'multer';
import type { Request, Response } from 'express';
import { getContainer } from '../container.js';
import fs from 'node:fs';

const RECORDINGS_PATH = `${process.cwd()}/recordings/qoe`;
const storage = multer.memoryStorage();

const upload = multer({ storage });

export const app = express.Router({
	strict: true,
});

// Used by browser to upload recordings to browseremulator's file system
app.post(
	'/qoeRecordings',
	upload.single('file'),
	(req: Request, res: Response) => {
		if (!req.file) {
			return res.status(400).send('No file uploaded');
		}
		const buffer = req.file.buffer;

		fs.appendFile(
			`${RECORDINGS_PATH}/${req.file.originalname}`,
			new Uint8Array(buffer),
			err => {
				if (err) {
					res.status(500).send(err.message);
				} else {
					res.status(200).send();
				}
			},
		);
	},
);

app.post('/analysis', async (_: Request, res: Response) => {
	const container = getContainer();
	const qoeAnalyzerService = container.resolve('qoeAnalyzerService');
	const status = await qoeAnalyzerService.runQoEAnalysis();
	res.status(200).send(status);
});
