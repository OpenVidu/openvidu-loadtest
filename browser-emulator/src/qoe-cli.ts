import { readFileSync } from 'node:fs';
import {
	runQoEAnalysisBlocking,
	processFilesAndUploadResults,
} from './services/qoe-analysis/qoe-analysis-runner.ts';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import type { JSONQoeProcessing } from './types/json.type.ts';
const argv = yargs(hideBin(process.argv))
	.options({
		cpus: { type: 'number', default: undefined },
		onlyfiles: { type: 'boolean', default: false },
		process: { type: 'boolean', default: false },
		processPath: { type: 'string', default: undefined },
		debug: { type: 'boolean', default: false },
		'all-analysis': { type: 'boolean', default: false },
	})
	.parseSync();

const maxCpus = argv.cpus;
const onlyFiles = argv.onlyfiles;
const debug = argv.debug;
const allAnalysis = argv['all-analysis'];
const pythonpath = process.env.PYTHONPATH;
if (pythonpath) {
	process.env.PYTHONPATH = process.cwd();
} else {
	process.env.PYTHONPATH = pythonpath + ':' + process.cwd();
}
const jsonText: string = readFileSync(
	`${process.cwd()}/qoe-results-processing-config.json`,
	'utf-8',
);
const parsedInfo: unknown = JSON.parse(jsonText);
const info = parsedInfo as JSONQoeProcessing;
if (argv.process) {
	await processFilesAndUploadResults(info, argv.processPath);
} else {
	await runQoEAnalysisBlocking(info, {
		maxCpus,
		onlyFiles,
		allAnalysis,
		debug,
	});
}
