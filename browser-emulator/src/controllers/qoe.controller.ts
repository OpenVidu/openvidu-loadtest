import * as express from 'express';
import multer = require('multer');
import { Request, Response } from 'express';
import { QoeAnalyzerService } from '../services/qoe-analyzer.service';

const RECORDINGS_PATH = `${process.env.PWD}/recordings/qoe`;
var storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, RECORDINGS_PATH)
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname)
    }
})

const upload = multer({ storage });

export const app = express.Router({
    strict: true,
});

// Used by browser to upload recordings to browseremulator's file system
app.post('/qoeRecordings', upload.single("file"), (req: Request, res: Response) => {
    res.status(200).send();
});

app.post('/analysis', async (req: Request, res: Response) => {
    const qoeAnalyzerService: QoeAnalyzerService = QoeAnalyzerService.getInstance();
    const status = await qoeAnalyzerService.runQoEAnalysis();
    res.status(200).send(status);
});