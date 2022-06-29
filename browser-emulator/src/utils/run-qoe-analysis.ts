import { readFileSync } from 'fs';
import { JSONQoeProcessingELK } from '../types/api-rest.type';
import { runQoEAnalysisBlocking } from '../utils/qoe-analysis-utils'

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
runQoEAnalysisBlocking(info)