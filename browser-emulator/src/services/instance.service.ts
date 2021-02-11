import * as os  from 'node-os-utils';

export class InstanceService {

	constructor() {}

	async getCpuUsage(): Promise<number> {
		const cpuUsage: number = await os.cpu.usage();
		return cpuUsage;
	}


}