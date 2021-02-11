var osu = require('node-os-utils');

export class InstanceService {

	constructor() {}

	async getCpuUsage(): Promise<number> {
		const cpuUsage: number = await osu.cpu.usage();
		return cpuUsage;
	}


}