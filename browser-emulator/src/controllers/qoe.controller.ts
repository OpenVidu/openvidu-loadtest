import * as express from 'express';
import multer = require('multer');
import { Request, Response } from 'express';

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

app.post('/qoeRecordings', upload.single("file"), (req: Request, res: Response) => {
    res.status(200).send();
});