import { spawn } from 'child_process';
import fs = require('fs');
import { BrowserManagerService } from './browser-manager.service';
import fsPromises = fs.promises;
const pLimit = require('p-limit');
import { ElasticSearchService } from './elasticsearch.service';
import { JSONQoEInfo } from '../types/api-rest.type';

export class QoeAnalyzerService {

    private static instance: QoeAnalyzerService;

    constructor(
        private filesIn = {
            finished: 0,
            remainingFiles: 0,
        },
        private readonly elasticSearchService: ElasticSearchService = ElasticSearchService.getInstance(),
        private readonly framerate: number = BrowserManagerService.getInstance().lastRequestInfo.properties.frameRate,
        private readonly width: string = BrowserManagerService.getInstance().lastRequestInfo.properties.resolution.split("x")[0],
        private readonly height: string = BrowserManagerService.getInstance().lastRequestInfo.properties.resolution.split("x")[1],
        private readonly PRESENTER_VIDEO_FILE_LOCATION =
            `${process.env.PWD}/src/assets/mediafiles/fakevideo_${framerate}fps_${BrowserManagerService.getInstance().lastRequestInfo.properties.resolution}.y4m`,
        private readonly PRESENTER_AUDIO_FILE_LOCATION = `${process.env.PWD}/src/assets/mediafiles/fakeaudio.wav`,
        private readonly limit = pLimit(1), // Scripts are already multithreaded
        // TODO: Configurable video length
        private readonly FRAGMENT_DURATION: number = 5,
        private readonly PADDING_DURATION: number = 1, 
    ) { }

    static getInstance() {
        if (!QoeAnalyzerService.instance) {
            QoeAnalyzerService.instance = new QoeAnalyzerService();
        }
        return QoeAnalyzerService.instance;
    }

    public async runQoEAnalysis() {
        const dir = `${process.env.PWD}/recordings/qoe`
        const files = await fsPromises.access(dir, fs.constants.R_OK | fs.constants.W_OK)
            .then(() => fsPromises.readdir(dir))
        console.log(files);
        this.filesIn['remainingFiles'] = this.filesIn['remainingFiles'] + files.length;
        const timestamps = await this.elasticSearchService.getStartTimes()
        const promises = [];
        files.forEach((file) => {
            const filePath = `${dir}/${file}`;
            const fileName = file.split('/').pop();
            const prefix = fileName.split('.')[0];
            promises.push(this.limit(() => this.runSingleAnalysis(filePath, fileName)
            .then(async () => {
                const qoeInfo = prefix.split('_');
                const session = qoeInfo[1];
                const userFrom = qoeInfo[2];
                const userTo = qoeInfo[3];
                const jsonText = await fsPromises.readFile(prefix + "_cuts.json", 'utf-8')
                return [session, userFrom, userTo, jsonText]
            }).catch(err => {
                console.error(err)
            })))
        });
        Promise.all(promises).then((info) => {
            const jsonsELK: JSONQoEInfo[] = info.map(infoArray => {
                const session = infoArray[0];
                const userFrom = infoArray[1];
                const userTo = infoArray[2];
                const jsonText = infoArray[3];
                const json = JSON.parse(jsonText);
                json["session"] = session;
                json["userFrom"] = userFrom;
                json["userTo"] = userTo;
                const timestampString: string = timestamps.find(timestamp => timestamp.new_participant_session === session && timestamp.new_participant_id === userFrom)[0];
                const timestampDate = new Date(timestampString);
                timestampDate.setSeconds(timestampDate.getSeconds() + 2 * this.PADDING_DURATION * (json.cutIndex + 1) + this.FRAGMENT_DURATION * (json.cutIndex + 1));
                json["timestamp"] = timestampDate.toString();
                return json
            })
            return this.elasticSearchService.sendBulkJsons(jsonsELK)
        })

        return this.getStatus();
    }

    private async runScript(script: string) {
        console.log(script);
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
                    console.error(`exit code ${code}`);
                    return reject({
                        error: code
                    });
                } else {
                    return resolve("");
                }
            });
        })
        return promise
    }

    // TODO: Configurable video length
    private async runSingleAnalysis(filePath: string, fileName: string): Promise<void> {
        const qoeInfo = fileName.split('.')[0].split('_');
        const session = qoeInfo[1];
        const userFrom = qoeInfo[2];
        const userTo = qoeInfo[3];
        const prefix = `v-${session}-${userFrom}-${userTo}`;
        return this.runScript(`python3 ${process.env.PWD}/qoe-scripts/VideoProcessing.py --presenter=${this.PRESENTER_VIDEO_FILE_LOCATION} --presenter_audio=${this.PRESENTER_AUDIO_FILE_LOCATION} --viewer=${filePath} --prefix=${prefix} --fragment_duration_secs=${this.FRAGMENT_DURATION} --padding_duration_secs=${this.PADDING_DURATION} --width=${this.width} --height=${this.height} --fps=${this.framerate}`)
        //return Promise.resolve("")
            .then(() => {
                this.filesIn["finished"]++;
                this.filesIn['remainingFiles']--;
            });
    }

    public getStatus() {
        return this.filesIn;
    }
}
