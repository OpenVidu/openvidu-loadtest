import { readFileSync } from 'fs';
import { JSONQoeProcessing } from '../types/api-rest.type';
import { runQoEAnalysisBlocking } from '../utils/qoe-analysis-utils'

const jsonText: string = readFileSync(`${process.env.PWD}/qoe-results-processing-config.json`, 'utf-8');
const info: JSONQoeProcessing = JSON.parse(jsonText)
runQoEAnalysisBlocking(info)