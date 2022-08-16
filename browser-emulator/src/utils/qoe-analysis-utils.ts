import { JSONQoEInfo, JSONQoeProcessing, JSONUserInfo } from "../types/api-rest.type";
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

export async function runQoEAnalysisBlocking(processingInfo: JSONQoeProcessing, maxCpus?: number, onlyFiles = false) {
    const dir = `${process.env.PWD}/recordings/qoe`
    const files = await fsPromises.access(dir, fs.constants.R_OK | fs.constants.W_OK)
        .then(() => fsPromises.readdir(dir))
    await runQoEAnalysis(processingInfo, dir, files, maxCpus, onlyFiles).then(() => {
        console.log("Finished running QoE analysis")
    })
    return files;
}

async function runQoEAnalysis(processingInfo: JSONQoeProcessing, dir: string, files: string[], maxCpus?: number, onlyFiles = false) {
    let timestamps: JSONUserInfo[] = []
    if (!onlyFiles) {
        await elasticSearchService.initialize(processingInfo.index)
        timestamps = await getTimestamps(processingInfo)
    }
    const promises = [];
    files.forEach((file) => {
        const filePath = `${dir}/${file}`;
        const fileName = file.split('/').pop();
        const prefix = fileName.split('.')[0];
        promises.push(limit(() => runSingleAnalysis(filePath, fileName, processingInfo, maxCpus)
            .then(async () => {
                if (!onlyFiles) {
                    return readJSONFile(prefix)
                }
            }).catch(err => {
                console.error(err)
            })))
    });
    return Promise.all(promises)
        .then((info) => {
            if (!onlyFiles) {
                processAndUploadResults(timestamps, info, processingInfo)
            }
        })
        .then(() => {
            if (!onlyFiles) {
                console.log("Finished uploading results to ELK")
            }
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

async function runSingleAnalysis(filePath: string, fileName: string, processingInfo: JSONQoeProcessing, maxCpus?: number): Promise<string> {
    const qoeInfo = fileName.split('.')[0].split('_');
    const session = qoeInfo[1];
    const userFrom = qoeInfo[2];
    const userTo = qoeInfo[3];
    const prefix = `v-${session}-${userFrom}-${userTo}`;
    let maxCpusString = ""
    if (maxCpus !== undefined) {
        maxCpusString = " --max_cpus " + maxCpus;
    }
    return runScript(`python3 ${process.env.PWD}/qoe_scripts/qoe_analyzer.py --presenter ${processingInfo.presenter_video_file_location} --presenter_audio ${processingInfo.presenter_audio_file_location} --viewer ${filePath} --prefix ${prefix} --fragment_duration_secs ${processingInfo.fragment_duration} --padding_duration_secs ${processingInfo.padding_duration} --width ${processingInfo.width} --height ${processingInfo.height} --fps ${processingInfo.framerate}` + maxCpusString)
}

async function readJSONFile(prefix: string) {
    console.log("Finished running script, reading JSON file...")
    const qoeInfo = prefix.split('_');
    const session = qoeInfo[1];
    const userFrom = qoeInfo[2];
    const userTo = qoeInfo[3];
    const filePrefix = `v-${session}-${userFrom}-${userTo}`;
    const jsonText = await fsPromises.readFile(filePrefix + "_cuts.json", 'utf-8')
    console.log("JSON read")
    return [session, userFrom, userTo, jsonText]
}

async function getTimestamps(processingInfo: JSONQoeProcessing) {
    if (processingInfo.timestamps && processingInfo.timestamps.length > 0) {
        return processingInfo.timestamps;
    }
    else {
        return await elasticSearchService.getStartTimes()
    }
}

async function processAndUploadResults(timestamps: JSONUserInfo[], info: any[], processingInfo: JSONQoeProcessing) {
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
    let jsonsELK: JSONQoEInfo[] = info.flatMap(infoArray => {
        const session = infoArray[0];
        const userFrom = infoArray[1];
        const userTo = infoArray[2];
        const jsonText = infoArray[3];
        const json = JSON.parse(jsonText);
        // Video starts when the latest of the 2 users enters the session
        if (!(session in userStartMap) || !(userFrom in userStartMap[session]) || !(userTo in userStartMap[session])) {
            console.error(`Could not find start time for session ${session} user ${userFrom} and user ${userTo}`)
            return undefined;
        }
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
    jsonsELK = jsonsELK.filter(json => json !== undefined)
    console.log("Finished processing results for ELK, writing to ElasticSearch...")
    return elasticSearchService.sendBulkJsons(jsonsELK)
}

export async function processFilesAndUploadResults(processingInfo: JSONQoeProcessing) {
    await elasticSearchService.initialize(processingInfo.index)
    const timestamps = await getTimestamps(processingInfo)
    let files = await fsPromises.readdir(process.env.PWD)
    files = files.filter(f => (path.extname(f).toLowerCase() === ".json") && (f.includes("_cuts.json")))
    const filesInfo = []
    for (const file of files) {
        const prefix = file.split('_cuts')[0]
        const qoeInfo = prefix.split('-');
        const session = qoeInfo[1];
        const userFrom = qoeInfo[2];
        const userTo = qoeInfo[3];
        const jsonText = await fsPromises.readFile(prefix + "_cuts.json", 'utf-8')
        filesInfo.push([session, userFrom, userTo, jsonText])
    }
    await processAndUploadResults(timestamps, filesInfo, processingInfo)
    console.log("Finished uploading results to ELK")
}