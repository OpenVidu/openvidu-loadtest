import { readFileSync } from 'fs';
import { JSONQoeProcessingELK } from '../types/api-rest.type';
import { runQoEAnalysisBlocking, processFilesAndUploadResults } from '../utils/qoe-analysis-utils'
import yargs = require('yargs/yargs');
import { hideBin } from 'yargs/helpers';
const argv = yargs(hideBin(process.argv)).options({
    cpus: { type: 'number', default: undefined },
    onlyfiles: { type: 'boolean', default: false },
    process: { type: 'boolean', default: false }
}).parseSync()

const maxCpus = argv.cpus;
const onlyFiles = argv.onlyfiles
const pythonpath = process.env['PYTHONPATH']
if (!pythonpath) {
    process.env['PYTHONPATH'] = pythonpath + ':' + process.env['PWD']
} else {
    process.env['PYTHONPATH'] = process.env['PWD']
}
const jsonText: string = readFileSync(`${process.env.PWD}/qoe-results-processing-config.json`, 'utf-8');
const info: JSONQoeProcessingELK = JSON.parse(jsonText)
process.env.ELASTICSEARCH_HOSTNAME = info.elasticsearch_hostname;
process.env.ELASTICSEARCH_USERNAME = info.elasticsearch_username;
process.env.ELASTICSEARCH_PASSWORD = info.elasticsearch_password;
process.env.ELASTICSEARCH_INDEX = info.index;
if (argv.process) {
    processFilesAndUploadResults(info)
} else {
    runQoEAnalysisBlocking(info, maxCpus, onlyFiles)
}