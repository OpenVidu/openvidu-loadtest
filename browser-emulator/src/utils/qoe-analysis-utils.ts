import { JSONQoEInfo, JSONQoeProcessing } from "../types/api-rest.type";
import fs = require('fs');
import fsPromises = fs.promises;
const pLimit = require('p-limit');
import path = require('path');
import { spawn } from 'child_process';
import { ElasticSearchService } from "../services/elasticsearch.service";

const limit = pLimit(1) // Scripts are already multithreaded
const elasticSearchService = ElasticSearchService.getInstance();

export async function runQoEAnalysisNonBlocking(processingInfo: JSONQoeProcessing) {
    const dir = `${process.env.PWD}/recordings/qoe`
    const files = await fsPromises.access(dir, fs.constants.R_OK | fs.constants.W_OK)
        .then(() => fsPromises.readdir(dir))
    runQoEAnalysis(processingInfo, dir, files).then(() => {
        console.log("Finished running QoE analysis")
    })
    return files;
}

export async function runQoEAnalysisBlocking(processingInfo: JSONQoeProcessing) {
    const dir = `${process.env.PWD}/recordings/qoe`
    const files = await fsPromises.access(dir, fs.constants.R_OK | fs.constants.W_OK)
        .then(() => fsPromises.readdir(dir))
    await runQoEAnalysis(processingInfo, dir, files).then(() => {
        console.log("Finished running QoE analysis")
    })
    return files;
}

async function runQoEAnalysis(processingInfo: JSONQoeProcessing, dir: string, files: string[]) {
    elasticSearchService.initialize(processingInfo.index)
    let timestamps = []
    if (processingInfo.timestamps && processingInfo.timestamps.length > 0) {
        timestamps = processingInfo.timestamps;
    }
    else {
        timestamps = await this.elasticSearchService.getStartTimes()
    }
    const promises = [];
    files.forEach((file) => {
        const filePath = `${dir}/${file}`;
        const fileName = file.split('/').pop();
        const prefix = fileName.split('.')[0];
        promises.push(limit(() => runSingleAnalysis(filePath, fileName, processingInfo)
            .then(async () => {
                console.log("Finished running script, reading JSON file...")
                const qoeInfo = prefix.split('_');
                const session = qoeInfo[1];
                const userFrom = qoeInfo[2];
                const userTo = qoeInfo[3];
                const filePrefix = `v-${session}-${userFrom}-${userTo}`;
                const jsonText = await fsPromises.readFile(filePrefix + "_cuts.json", 'utf-8')
                console.log("JSON read")
                return [session, userFrom, userTo, jsonText]
            }).catch(err => {
                console.error(err)
            })))
    });
    return Promise.all(promises).then((info) => {
        console.log("Finished running all scripts, processing results for ELK...")
        const userStartMap = {}
        for (const timestamp of timestamps) {
            const timestampSession = timestamp.new_participant_session;
            const timestampUserFrom = timestamp.new_participant_id;
            const timestampDate = new Date(timestamp["@timestamp"])
            if (!userStartMap[timestampSession]) {
                userStartMap[timestampSession] = {}
            }
            userStartMap[timestampSession][timestampUserFrom] = timestampDate;
        }
        const jsonsELK: JSONQoEInfo[] = info.flatMap(infoArray => {
            const session = infoArray[0];
            const userFrom = infoArray[1];
            const userTo = infoArray[2];
            const jsonText = infoArray[3];
            const json = JSON.parse(jsonText);
            // Video starts when the latest of the 2 users enters the session
            const userFromDate = userStartMap[session][userFrom].getTime()
            const userToDate = userStartMap[session][userTo].getTime()
            const videoStart = Math.max(userFromDate, userToDate);
            for (const cut of json) {
                cut["session"] = session;
                cut["userFrom"] = userFrom;
                cut["userTo"] = userTo;
                const timestampDate = new Date(videoStart);
                timestampDate.setSeconds(timestampDate.getSeconds() + 2 * processingInfo.padding_duration * (cut.cut_index + 1) + processingInfo.fragment_duration * (cut.cut_index + 1));
                cut["@timestamp"] = timestampDate.toISOString();
            }
            return json
        })
        console.log("Finished processing results for ELK, writing to ElasticSearch...")
        return elasticSearchService.sendBulkJsons(jsonsELK)
    }).then(() => {
        console.log("Finished uploading results to ELK")
    })
}

async function runScript(script: string): Promise<string> {
    console.log(script);
    const promise: Promise<string> = new Promise((resolve, reject) => {
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

async function runSingleAnalysis(filePath: string, fileName: string, processingInfo: JSONQoeProcessing): Promise<string> {
    const qoeInfo = fileName.split('.')[0].split('_');
    const session = qoeInfo[1];
    const userFrom = qoeInfo[2];
    const userTo = qoeInfo[3];
    const prefix = `v-${session}-${userFrom}-${userTo}`;
    return runScript(`python3 ${process.env.PWD}/qoe_scripts/qoe_analyzer.py --presenter=${processingInfo.presenter_video_file_location} --presenter_audio=${processingInfo.presenter_audio_file_location} --viewer=${filePath} --prefix=${prefix} --fragment_duration_secs=${processingInfo.fragment_duration} --padding_duration_secs=${processingInfo.padding_duration} --width=${processingInfo.width} --height=${processingInfo.height} --fps=${processingInfo.framerate}`)
}
