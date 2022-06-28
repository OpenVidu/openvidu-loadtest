import { readFileSync } from 'fs';
import { JSONQoeProcessing } from '../types/api-rest.type';
import { runQoEAnalysisBlocking } from '../utils/qoe-analysis-utils'

const pythonpath = process.env['PYTHONPATH']
if (!pythonpath) {
    process.env['PYTHONPATH'] = pythonpath + ':' + process.env['PWD']
} else {
    process.env['PYTHONPATH'] = process.env['PWD']
}
const jsonText: string = readFileSync(`${process.env.PWD}/qoe-results-processing-config.json`, 'utf-8');
const info: JSONQoeProcessing = JSON.parse(jsonText)
runQoEAnalysisBlocking(info)