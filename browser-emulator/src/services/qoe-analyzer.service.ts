import { exec } from 'child_process';
import fs = require('fs');
import { BrowserManagerService } from './browser-manager.service';
import fsPromises = fs.promises;
import glob = require('tiny-glob');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
import csvParser = require('csv-parser');
const pLimit = require('p-limit');
import os = require('os');
import { InstanceService } from './instance.service';

export class QoeAnalyzerService {

    private static instance: QoeAnalyzerService;

    constructor(
        private filesIn = {
            remainingFiles: 0,
            finished: 0,
            remux: 0,
            cut: 0,
            extractAudio: 0,
            alignOcr: 0,
            convertToYuv: 0,
            analysis: 0,
            cleanup: 0
        },
        private readonly instanceService: InstanceService = InstanceService.getInstance(),
        private readonly framerate: number = BrowserManagerService.getInstance().lastRequestInfo.properties.frameRate,
        private readonly width: string = BrowserManagerService.getInstance().lastRequestInfo.properties.resolution.split("x")[0],
        private readonly height: string = BrowserManagerService.getInstance().lastRequestInfo.properties.resolution.split("x")[1],
        private readonly PRESENTER_VIDEO_FILE_LOCATION =
            `${process.env.PWD}/src/assets/mediafiles/fakevideo_${framerate}fps_${BrowserManagerService.getInstance().lastRequestInfo.properties.resolution}.y4m`,
        private readonly PRESENTER_AUDIO_FILE_LOCATION = `${process.env.PWD}/src/assets/mediafiles/fakeaudio.wav`,
        private readonly limit = pLimit(os.cpus().length + 1)
    ) { }

    static getInstance() {
        if (!QoeAnalyzerService.instance) {
            QoeAnalyzerService.instance = new QoeAnalyzerService();
        }
        return QoeAnalyzerService.instance;
    }

    public async runQoEAnalysis() {
        const csvFile = `QOE_Analysis_${new Date().toISOString()}.csv`;
        console.log("Running QoE Analysis, saving in " + csvFile);
        const csvPath = `${process.env.PWD}/${csvFile}`;
        const dir = `${process.env.PWD}/recordings/qoe`
        const files = await fsPromises.access(dir, fs.constants.R_OK | fs.constants.W_OK)
            .then(() => fsPromises.readdir(dir))
        console.log(files);
        this.filesIn['remainingFiles'] = this.filesIn['remainingFiles'] + files.length;
        const promises = [];
        files.forEach((file) => {
            const filePath = `${dir}/${file}`;
            const fileName = file.split('/').pop();
            promises.push(
                this.runSingleAnalysis(filePath, fileName)
                    .then((results: number[]) => {
                        const record = {
                            file: fileName,
                            vmaf: results[0],
                            vifp: results[1],
                            ssim: results[2],
                            psnr: results[3],
                            msssin: results[4],
                            psnrhvs: results[5],
                            psnrhvsm: results[6],
                            pesq: results[7],
                            visqol: results[8]
                        }
                        console.log(record);
                        return record;
                    })
                    .catch(err => {
                        this.filesIn[err.key]--;
                        console.error(err)
                    })
            );
        });
        this.preparePresenter().then(() => Promise.all(promises))
            .then((records) => {
                // Create final CSV file
                const csvWriter = createCsvWriter({
                    path: csvPath,
                    header: [
                        { id: 'file', title: 'File' },
                        { id: 'vmaf', title: 'VMAF' },
                        { id: 'vifp', title: 'VIFp' },
                        { id: 'ssim', title: 'SSIM' },
                        { id: 'psnr', title: 'PSNR' },
                        { id: 'msssin', title: 'MS-SSIM' },
                        { id: 'psnrhvs', title: 'PSNR-HVS' },
                        { id: 'psnrhvsm', title: 'PSNR-HVS-M' },
                        { id: 'pesq', title: 'PESQ' },
                        { id: 'visqol', title: 'ViSQOL' }
                    ]
                })
                return csvWriter.writeRecords(records);
            })
            .then(() => this.instanceService.uploadQoeAnalysisToS3(csvFile))
            .then(() => Promise.all([
                fsPromises.rm(`presenter.yuv`),
                fsPromises.rm(`QOE_*.csv`),
                fsPromises.rm(`QOE_*.txt`)
            ]));

        return this.getStatus();
    }

    private async runScript(script: string, key: string = '') {
        console.log(script);
        if (key) {
            this.filesIn[key]++;
        }
        return this.limit(() => new Promise((resolve, reject) => {
            exec(script, {
                cwd: `${process.env.PWD}`,
                maxBuffer: Infinity,
                shell: "/bin/bash",
            }, (err, stdout, stderr) => {
                if (stderr) {
                    console.error(stderr);
                }
                if (stdout) {
                    console.log(stdout);
                }
                if (err) {
                    console.error(err);
                    return reject({
                        error: err,
                        key
                    });
                } else {
                    if (key) {
                        this.filesIn[key]--;
                    }
                    return resolve("");
                }
            });
        }))
    }

    // TODO: Configurable video length in align_ocr.sh
    private async preparePresenter() {
        console.log("Preparing presenter video");
        return this.runScript(`${process.env.PWD}/qoe-scripts/remux.sh -i=${this.PRESENTER_VIDEO_FILE_LOCATION} -p=presenter -w=${this.width} -h=${this.height} -f=${this.framerate} -o=presenter-remuxed.webm`)
            .then(() => this.runScript(`${process.env.PWD}/qoe-scripts/cut.sh --presenter -a=${this.PRESENTER_AUDIO_FILE_LOCATION} -ao=presenter-audio-cut.wav -i=presenter-remuxed.webm -o=presenter-cut.webm -p=p- -w=${this.width} -h=${this.height} -f=${this.framerate}`))
            .then(() => this.runScript(`${process.env.PWD}/qoe-scripts/align_ocr.sh -i=presenter-cut.webm -a=presenter-audio-cut.wav -o=presenter-ocr.webm -p=p-ocr- -l=5 -w=${this.width} -h=${this.height} -f=${this.framerate}`))
            .then(() => this.runScript(`${process.env.PWD}/qoe-scripts/convert_to_yuv.sh -i=presenter-ocr.webm -o=presenter.yuv`))
            .then(() => Promise.all([
                fsPromises.rm(`presenter-remux.webm`),
                fsPromises.rm(`presenter-remuxed.webm`),
                fsPromises.rm(`presenter-cut.webm`),
                fsPromises.rm(`presenter-audio-cut.wav`),
                fsPromises.rm(`jpgs/p-*.jpg`),
                fsPromises.rm(`jpgs/cut/p-*.jpg`),
            ]))
    }

    // TODO: Configurable video length in align_ocr.sh
    private async runSingleAnalysis(filePath: string, fileName: string): Promise<number[]> {
        const qoeInfo = fileName.split('.')[0].split('_');
        const session = qoeInfo[1];
        const userFrom = qoeInfo[2];
        const userTo = qoeInfo[3];
        const prefix = `v-${session}-${userFrom}-${userTo}`;
        return this.runScript(`${process.env.PWD}/qoe-scripts/remux.sh -i=${filePath} -p=${prefix} -w=640 -h=480 -f=30 -o=${prefix}-remuxed.webm`, "remux")
            .then(() => this.runScript(`${process.env.PWD}/qoe-scripts/cut.sh -i=${prefix}-remuxed.webm -o=${prefix}-cut -p=${prefix}- -w=640 -h=480 -f=30`, "cut"))
            .then(async () => {
                this.filesIn["extractAudio"]++;
                const promises = [];
                const paths = await glob(`${prefix}-cut-*.webm`);
                for (let i = 0; i < paths.length; i++) {
                    promises.push(this.runScript(`${process.env.PWD}/qoe-scripts/extractAudio.sh -i=${paths[i]} -o=${prefix}-cut-audio-${i}.wav`));
                }
                return Promise.all(promises);
            })
            .then(async () => {
                this.filesIn["extractAudio"]--;
                this.filesIn["alignOcr"]++;
                const promises = [];
                const pathsVideo = await glob(`${prefix}-cut-*.webm`);
                const pathsAudio = await glob(`${prefix}-cut-audio-*.wav`);
                for (let i = 0; i < pathsVideo.length; i++) {
                    promises.push(this.runScript(`${process.env.PWD}/qoe-scripts/align_ocr.sh -i=${pathsVideo[i]} -a=${pathsAudio[i]} -o=${prefix}-ocr-${i}.webm -p=${prefix}-ocr- -l=5 -w=${this.width} -h=${this.height} -f=${this.framerate}`));
                }
                return Promise.all(promises);
            })
            .then(async () => {
                this.filesIn["alignOcr"]--;
                this.filesIn["convertToYuv"]++;
                const promises = [];
                const paths = await glob(`${prefix}-ocr-*.webm`);
                for (let i = 0; i < paths.length; i++) {
                    promises.push(this.runScript(`${process.env.PWD}/qoe-scripts/convert_to_yuv.sh -i=${prefix}-ocr-${i}.webm -o=${prefix}-${i}.yuv`))
                }
                return Promise.all(promises);
            })
            .then(async () => {
                this.filesIn["convertToYuv"]--;
                this.filesIn["analysis"]++;
                const promises = [];
                const paths = await glob(`${prefix}-*.yuv`);
                for (let i = 0; i < paths.length; i++) {
                    promises.push(
                        this.runScript(`${process.env.PWD}/qoe-scripts/vmaf.sh -ip=presenter.yuv -iv=${prefix}-${i}.yuv -o=${prefix}-${i} -w=${this.width} -h=${this.height}`),
                        this.runScript(`${process.env.PWD}/qoe-scripts/vqmt.sh -ip=presenter.yuv -iv=${prefix}-${i}.yuv -o=${prefix}-${i} -w=${this.width} -h=${this.height}`),
                        this.runScript(`${process.env.PWD}/qoe-scripts/pesq.sh -ip=presenter-audio-cut.wav -iv=${prefix}-cut-audio-${i}.wav -o=${prefix}-${i}`),
                        this.runScript(`${process.env.PWD}/qoe-scripts/visqol.sh -ip=presenter-audio-cut.wav -iv=${prefix}-cut-audio-${i}.wav -o=${prefix}-${i}`)
                    );
                }
                await Promise.all(promises);
                const parsePromises = [
                    this.parseCsv(`${prefix}_vmaf.csv`, '0', false),
                    this.parseCsv(`${prefix}_vifp.csv`, 'value', true),
                    this.parseCsv(`${prefix}_ssim.csv`, 'value', true),
                    this.parseCsv(`${prefix}_psnr.csv`, 'value', true),
                    this.parseCsv(`${prefix}_msssim.csv`, 'value', true),
                    this.parseCsv(`${prefix}_psnrhvs.csv`, 'value', true),
                    this.parseCsv(`${prefix}_psnrhvsm.csv`, 'value', true),
                    this.parsePESQ(`${prefix}_pesq.txt`),
                    this.parseViSQOL(`${prefix}_visqol.txt`)
                ]
                return Promise.all(parsePromises);
            })
            .then(async (parseResults) => {
                console.log("Cleaning up")
                this.filesIn["analysis"]--;
                this.filesIn["cleanup"]++;
                await Promise.all([
                    fsPromises.rm(`${prefix}-remux.webm`),
                    fsPromises.rm(`${prefix}-remuxed.webm`),
                    fsPromises.rm(`${prefix}-cut*.webm`),
                    fsPromises.rm(`${prefix}.wav`),
                    fsPromises.rm(`resampled_${prefix}.wav`),
                    fsPromises.rm(`jpgs/${prefix}-*.jpg`),
                    fsPromises.rm(`jpgs/cut/${prefix}-*.jpg`),
                    fsPromises.rm(`${prefix}-*.yuv`),
                    fsPromises.rm(`${prefix}_*_vmaf.json`),
                    fsPromises.rm(`${prefix}_*.csv`),
                    fsPromises.rm(`${prefix}_*.txt`)
                ]);
                this.filesIn["cleanup"]--;
                this.filesIn["finished"]++;
                this.filesIn['remainingFiles']--;
                return parseResults
            });
    }

    private async parseCsv(file: string, column: string, headers: boolean): Promise<number> {
        return new Promise<number>(async (resolve, reject) => {
            const results = [];
            try {
                fs.createReadStream(file)
                    .pipe(csvParser({
                        headers
                    }))
                    .on("data", (data: any) => {
                        results.push(data[column]);
                    })
                    .on("end", () => {
                        const avg: number = results.reduce((a, b) => a + b, 0) / results.length;
                        resolve(avg);
                    })
                    .on("error", (err: any) => {
                        reject(err);
                    });
            } catch (err) {
                reject(err);
            }
        })
    }

    private async parsePESQ(file: string): Promise<number> {
        const text = await fsPromises.readFile(file, 'utf8');
        const firstSplit = text.split("\t");
        const rawMOS: number = parseFloat(firstSplit[0].split("= ")[1]);
        const MOSLQO: number = parseFloat(firstSplit[1]);
        return (rawMOS + MOSLQO) / 2;

    }

    private async parseViSQOL(file: string): Promise<number> {
        const text = await fsPromises.readFile(file, 'utf8');
        return parseFloat(text.split("MOS-LQO:		")[1]);
    }

    public getStatus() {
        return this.filesIn;
    }
}
