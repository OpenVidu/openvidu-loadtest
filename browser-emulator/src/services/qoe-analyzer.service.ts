import { spawn } from 'child_process';
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
            "video-processing": 0,
            "analysis": 0,
            cleanup: 0,
            finished: 0,
            remainingFiles: 0,
        },
        private readonly instanceService: InstanceService = InstanceService.getInstance(),
        private readonly framerate: number = BrowserManagerService.getInstance().lastRequestInfo.properties.frameRate,
        private readonly width: string = BrowserManagerService.getInstance().lastRequestInfo.properties.resolution.split("x")[0],
        private readonly height: string = BrowserManagerService.getInstance().lastRequestInfo.properties.resolution.split("x")[1],
        private readonly PRESENTER_VIDEO_FILE_LOCATION =
            `${process.env.PWD}/src/assets/mediafiles/fakevideo_${framerate}fps_${BrowserManagerService.getInstance().lastRequestInfo.properties.resolution}.y4m`,
        private readonly PRESENTER_AUDIO_FILE_LOCATION = `${process.env.PWD}/src/assets/mediafiles/fakeaudio.wav`,
        private readonly limitProcessing = pLimit(1), // Scripts are already multithreaded
        private readonly limitAnalysis = pLimit(os.cpus().length - 1)
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
            const prefix = fileName.split('.')[0];
            promises.push(
                this.runSingleAnalysis(filePath, fileName)
                    .then((results: number[]) => {
                        const records = []
                        for (let i = 0; i < (results.length / 9); i++) {
                            const record = {
                                cut: prefix + "-" + i,
                                vmaf: results[i % 9],
                                vifp: results[i % 9 + 1],
                                ssim: results[i % 9 + 2],
                                psnr: results[i % 9 + 3],
                                msssin: results[i % 9 + 4],
                                psnrhvs: results[i % 9 + 5],
                                psnrhvsm: results[i % 9 + 6],
                                pesq: results[i % 9 + 7],
                                visqol: results[i % 9 + 8]
                            }
                            console.log(record);
                            records.push(record)
                        }
                        return records;
                    })
                    .catch(err => {
                        this.filesIn[err.key]--;
                        console.error(err)
                    })
            );
        });
        this.preparePresenter().then(() => Promise.all(promises))
            .then((records) => {
                const flattenedRecords = records.flat();
                // Create final CSV file
                const csvWriter = createCsvWriter({
                    path: csvPath,
                    header: [
                        { id: 'cut', title: 'File fragment' },
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
                return csvWriter.writeRecords(flattenedRecords);
            })
            .then(() => this.instanceService.uploadQoeAnalysisToS3(csvFile))
            .then(async () => {
                const filesToDelete = await Promise.all([
                    glob(`QOE_*.csv`),
                    glob(`QOE_*.txt`)
                ])
                const promises = filesToDelete.flat().map(a => fsPromises.unlink(a));
                return Promise.all(promises)
            });

        return this.getStatus();
    }

    private async runScript(script: string, processing = false, key: string = '') {
        console.log(script);
        if (key) {
            this.filesIn[key]++;
        }
        const promise = new Promise((resolve, reject) => {
            const execProcess = spawn(script, [], {
                cwd: `${process.env.PWD}`,
                shell: "/bin/bash",
            });
            execProcess.stdout.on('data', (data) => {
                console.log(data.toString());
            });
            execProcess.stderr.on('data', (data) => {
                console.error(data.toString());
            });
            execProcess.on('exit', (code) => {
                if (code !== 0) {
                    // TODO: Remove this when vqmt is fixed
                    if (script.includes("vqmt")) {
                        if (key) {
                            this.filesIn[key]--;
                        }
                        return resolve("");
                    }
                    console.error(`exit code ${code}`);
                    return reject({
                        error: code,
                        key
                    });
                } else {
                    if (key) {
                        this.filesIn[key]--;
                    }
                    return resolve("");
                }
            });
        })
        if (processing) {
            return this.limitProcessing(() => promise)
        } else {
            return this.limitAnalysis(() => promise)
        }
    }

    private async runFfmpeg(args: string, output: string) {
        return fsPromises.access(output).catch(() => {
            console.log("ffmpeg " + args + " " + output);
            return this.limitProcessing(() => new Promise((resolve, reject) => {
                const execProcess = spawn("ffmpeg " + args + " " + output, [], {
                    cwd: `${process.env.PWD}`,
                    shell: "/bin/bash",
                });
                execProcess.stdout.on('data', (data) => {
                    console.log(data);
                });
                execProcess.stderr.on('data', (data) => {
                    console.error(data);
                });
                execProcess.on('exit', (code) => {
                    if (code !== 0) {
                        console.error(`exit code ${code}`);
                        return reject({
                            error: code
                        });
                    } else {
                        return resolve("");
                    }
                });
            }))
        })
    }

    // TODO: Configurable video length
    private async preparePresenter() {
        console.log("Preparing presenter video");
        return this.runFfmpeg(`-i ${this.PRESENTER_VIDEO_FILE_LOCATION} -ss 1 -to 6`, "presenter.yuv")
            .then(() => this.runFfmpeg(`-i ${this.PRESENTER_AUDIO_FILE_LOCATION} -ss 1 -to 6 -async 1`, "presenter.wav"))
            .then(() => this.runFfmpeg(`-i ${this.PRESENTER_AUDIO_FILE_LOCATION} -ar 16000 -ss 1 -to 6 -async 1`, "presenter-pesq.wav"))
    }

    // TODO: Configurable video length
    private async runSingleAnalysis(filePath: string, fileName: string): Promise<number[]> {
        const qoeInfo = fileName.split('.')[0].split('_');
        const session = qoeInfo[1];
        const userFrom = qoeInfo[2];
        const userTo = qoeInfo[3];
        const prefix = `v-${session}-${userFrom}-${userTo}`;
        return this.runScript(`python3 ${process.env.PWD}/qoe-scripts/VideoProcessing.py --viewer=${filePath} --prefix=${prefix} --fragment_duration_sec=5 --width=${this.width} --height=${this.height} --fps=${this.framerate}`, true, "video-processing")
            //return Promise.resolve("")
            .then(() => {
                this.filesIn["analysis"]++;
                console.log("new analysis")
                return glob(`${process.env.PWD}/outputs/${prefix}_*.y4m`);
            })
            .then((paths) => {
                const promises = [];
                for (let i = 0; i < paths.length; i++) {
                    promises.push(
                        this.runScript(`${process.env.PWD}/qoe-scripts/vmaf.sh -ip=presenter.yuv -iv=${process.env.PWD}/outputs/${prefix}_${i}.y4m -o=${prefix}-${i} -w=${this.width} -h=${this.height}`),
                        this.runScript(`${process.env.PWD}/qoe-scripts/vqmt.sh -ip=presenter.yuv -iv=${process.env.PWD}/outputs/${prefix}_${i}.y4m -o=${prefix}-${i} -w=${this.width} -h=${this.height}`),
                        this.runScript(`${process.env.PWD}/qoe-scripts/pesq.sh -ip=presenter-pesq.wav -iv=${process.env.PWD}/outputs_audio/${prefix}_pesq_${i}.wav -o=${prefix}-${i}`),
                        this.runScript(`${process.env.PWD}/qoe-scripts/visqol.sh -ip=presenter.wav -iv=${process.env.PWD}/outputs_audio/${prefix}_${i}.wav -o=${prefix}-${i}`)
                    );
                }
                return Promise.all(promises);
            })
            .then((results) => {
                console.log("parsing analysis")
                const parsePromises = []
                // 4 scripts ran per file
                for (let i = 0; i < (results.length / 4); i++) {
                    parsePromises.push(
                        this.parseCsv(`${prefix}-${i}_vmaf.csv`, '0', false),
                        this.parseCsv(`${prefix}-${i}_vifp.csv`, 'value', true),
                        this.parseCsv(`${prefix}-${i}_ssim.csv`, 'value', true),
                        this.parseCsv(`${prefix}-${i}_psnr.csv`, 'value', true),
                        this.parseCsv(`${prefix}-${i}_msssim.csv`, 'value', true),
                        this.parseCsv(`${prefix}-${i}_psnrhvs.csv`, 'value', true),
                        this.parseCsv(`${prefix}-${i}_psnrhvsm.csv`, 'value', true),
                        this.parsePESQ(`${prefix}-${i}_pesq.txt`),
                        this.parseViSQOL(`${prefix}-${i}_visqol.txt`)
                    )
                }
                return Promise.all(parsePromises);
            })
            .then(async (parseResults: number[]) => {
                console.log("Cleaning up")
                this.filesIn["analysis"]--;
                this.filesIn["cleanup"]++;
                console.log("new cleanup")
                const filesToDelete = await Promise.all([
                    glob(`${process.env.PWD}/outputs/${prefix}_*.y4m`),
                    glob(`${process.env.PWD}/outputs_audio/${prefix}_*.y4m`),
                    glob(`*_vmaf.json`),
                    glob(`*.csv`),
                    glob(`*.txt`)
                ])
                const promises = filesToDelete.flat().map(a => fsPromises.unlink(a));
                //const promises = []
                return Promise.all([Promise.resolve(parseResults), Promise.all(promises)]);
            })
            .then((promiseResults) => {
                const parseResults: number[] = promiseResults[0];
                this.filesIn["cleanup"]--;
                this.filesIn["finished"]++;
                console.log("new finished")
                this.filesIn['remainingFiles']--;
                return parseResults
            });
    }

    private async parseCsv(file: string, column: string, headers: boolean): Promise<number> {
        console.log("parsing " + file)
        return new Promise<number>((resolve, reject) => {
            const results = [];
            try {
                const options = {}
                if (!headers) {
                    options['headers'] = false;
                }
                fs.createReadStream(file)
                    .pipe(csvParser(options))
                    .on("data", (data: any) => {
                        const numberData = Number(data[column])
                        if (!isNaN(numberData)) {
                            results.push(data[column]);
                        }
                    })
                    .on("end", () => {
                        const avg: number = results.reduce((a, b) => Number(a) + Number(b), 0) / results.length;
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
        console.log("parsing " + file)
        const text = await fsPromises.readFile(file, 'utf8');
        const firstSplit = text.split("\t");
        const rawMOS: number = parseFloat(firstSplit[0].split("= ")[1]);
        const MOSLQO: number = parseFloat(firstSplit[1]);
        return (rawMOS + MOSLQO) / 2;

    }

    private async parseViSQOL(file: string): Promise<number> {
        console.log("parsing " + file)
        const text = await fsPromises.readFile(file, 'utf8');
        return parseFloat(text.split("MOS-LQO:		")[1]);
    }

    public getStatus() {
        return this.filesIn;
    }
}
