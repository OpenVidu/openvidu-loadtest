#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { argv, exit } from 'node:process';

interface PerfRunOutput {
	runId: string;
	timestamp: string;
	system: {
		nodeVersion: string;
		platform: string;
		arch: string;
		cpus: number;
		totalMemoryGb: number;
	};
	results: unknown[];
}

interface SaturationResult {
	name: string;
	topology: string;
	config: Record<string, unknown>;
	ceiling: {
		sustained100Participants: number | null;
		firstFailedParticipants: number | null;
		firstFailureReason: string | null;
	};
	timeline: PhaseRecord[];
	totalDurationMs: number;
	cleanupDurationMs: number;
}

interface BenchmarkResult {
	name: string;
	config: Record<string, unknown>;
	timeline: PhaseRecord[];
	creationLatencyMs: {
		p50: number;
		p95: number;
		p99: number;
		min: number;
		max: number;
		avg: number;
	};
	errors: number;
	totalDurationMs: number;
	cleanupDurationMs: number;
	launcherMode: string;
}

interface ProcessProfile {
	pid: number;
	role: string;
	cpuPct: number | null;
	voluntaryCtxSw: number | null;
	nonvoluntaryCtxSw: number | null;
}

interface PerfRecordFile {
	phase: number;
	role: string;
	pid: number;
	filePath: string;
}

interface PhaseRecord {
	phase: number;
	totalParticipants: number;
	totalPublishers: number;
	totalSubscribers: number;
	cpu: number | null;
	memoryRssMb: number | null;
	containers?: ContainerMetric[];
	containerGroups?: ContainerGroupSummary[];
	creationLatencyMs: number | null;
	failed: boolean;
	failureReason?: string;
	processProfiles?: ProcessProfile[];
	perfFiles?: PerfRecordFile[];
}

interface ContainerMetric {
	name: string;
	group: string;
	cpuPercent: number;
	memPercent: number;
	memUsageMb: number;
}

interface ContainerGroupSummary {
	group: string;
	containerCount: number;
	totalCpuPercent: number;
	avgCpuPercent: number;
	totalMemUsageMb: number;
}

function analyze(filePath: string): void {
	const raw = readFileSync(filePath, 'utf8');
	const data = JSON.parse(raw) as PerfRunOutput;

	const results = data.results;
	const firstBenchmark = results.find(r => 'launcherMode' in r) as
		| BenchmarkResult
		| undefined;
	const mode = firstBenchmark?.launcherMode ?? 'unknown';

	console.log(`Run: ${data.runId}`);
	console.log(`Timestamp: ${data.timestamp}`);
	console.log(`Mode: ${mode}`);
	console.log(
		`System: ${data.system.cpus} CPUs / ${data.system.totalMemoryGb} GB RAM / ${data.system.platform} ${data.system.arch}`,
	);
	console.log();

	const benchmarks = results.filter(
		r => 'creationLatencyMs' in r,
	) as BenchmarkResult[];
	const saturations = results.filter(
		r => 'ceiling' in r,
	) as SaturationResult[];

	if (benchmarks.length > 0) {
		console.log('BENCHMARKS');
		console.log('-'.repeat(100));
		console.log(
			`${'Name'.padEnd(35)} ${'Topology'.padEnd(22)} ${'Result'.padEnd(7)} ${'P50'.padEnd(8)} ${'P95'.padEnd(8)} ${'P99'.padEnd(8)} ${'Avg'.padEnd(8)} ${'Errors'}`,
		);
		console.log('-'.repeat(100));
		for (const r of benchmarks) {
			const lat = r.creationLatencyMs;
			const topo =
				typeof r.config === 'object' &&
				r.config &&
				'topology' in r.config
					? String((r.config as Record<string, string>).topology)
					: '';
			const result = r.errors === 0 ? 'PASS' : 'FAIL';
			console.log(
				`${r.name.padEnd(35)} ${topo.padEnd(22)} ${result.padEnd(7)} ` +
					`${String(lat.p50).padEnd(8)} ${String(lat.p95).padEnd(8)} ${String(lat.p99).padEnd(8)} ` +
					`${String(lat.avg).padEnd(8)} ${r.errors}`,
			);
		}
		console.log();

		// Per-process profiles
		for (const r of benchmarks) {
			const t = r.timeline;
			const hasProfiles = t.some(
				p => p.processProfiles && p.processProfiles.length > 0,
			);
			if (!hasProfiles) continue;

			console.log(`  ${r.name} — Per-process CPU:`);
			console.log(
				`    ${'PID'.padEnd(8)} ${'Role'.padEnd(14)} ${'CPU%'.padEnd(10)} ${'vCtx'.padEnd(8)} ${'nvCtx'}`,
			);
			for (const p of t) {
				if (!p.processProfiles) continue;
				for (const pp of p.processProfiles) {
					const cpuStr =
						pp.cpuPct !== null ? pp.cpuPct.toFixed(1) + '%' : '-';
					const vStr =
						pp.voluntaryCtxSw !== null
							? String(pp.voluntaryCtxSw)
							: '-';
					const nvStr =
						pp.nonvoluntaryCtxSw !== null
							? String(pp.nonvoluntaryCtxSw)
							: '-';
					console.log(
						`    ${String(pp.pid).padEnd(8)} ${pp.role.padEnd(14)} ${cpuStr.padEnd(10)} ${vStr.padEnd(8)} ${nvStr}`,
					);
				}
			}

			// Perf data files
			const perfFiles = t.flatMap(p => p.perfFiles ?? []);
			if (perfFiles.length > 0) {
				console.log(`  Perf data files:`);
				for (const pf of perfFiles) {
					console.log(`    ${pf.filePath}`);
				}
			}
			console.log();
		}
	}

	if (saturations.length > 0) {
		console.log('SATURATION');
		console.log('-'.repeat(100));
		console.log(
			`${'Name'.padEnd(30)} ${'Ceiling'.padEnd(22)} ${'Sustained'.padEnd(12)} ${'CPU Peak'.padEnd(10)} ${'CPU Avg'.padEnd(10)} ${'Mem Peak'.padEnd(10)} ${'Fail Reason'}`,
		);
		console.log('-'.repeat(100));
		for (const r of saturations) {
			const c = r.ceiling;
			const t = r.timeline;
			const cpus = t
				.map(p => p.cpu)
				.filter((v): v is number => v !== null);
			const mems = t
				.map(p => p.memoryRssMb)
				.filter((v): v is number => v !== null);
			const cpuPeak =
				cpus.length > 0 ? `${Math.max(...cpus).toFixed(1)}%` : 'N/A';
			const cpuAvg =
				cpus.length > 0
					? `${(cpus.reduce((a, b) => a + b, 0) / cpus.length).toFixed(1)}%`
					: 'N/A';
			const memPeak =
				mems.length > 0 ? `${Math.max(...mems).toFixed(1)}MB` : 'N/A';
			const sustained =
				c.sustained100Participants !== null
					? String(c.sustained100Participants)
					: '—';
			const ceiling =
				c.firstFailedParticipants !== null
					? String(c.firstFailedParticipants)
					: 'timeout';
			const reason = c.firstFailureReason
				? c.firstFailureReason.includes('Timeout')
					? 'Timeout 30s'
					: c.firstFailureReason.slice(0, 50)
				: '—';
			console.log(
				`${r.name.padEnd(30)} ${ceiling.padEnd(22)} ${sustained.padEnd(12)} ${cpuPeak.padEnd(10)} ${cpuAvg.padEnd(10)} ${memPeak.padEnd(10)} ${reason}`,
			);
		}
		console.log();
	}

	// Container group summary across all results
	let maxPhaseContainers: { phase: PhaseRecord; source: string } | null =
		null;
	for (const r of results) {
		const t =
			'timeline' in r ? (r as { timeline: PhaseRecord[] }).timeline : [];
		for (const p of t) {
			if (p.containerGroups && p.containerGroups.length > 0) {
				if (
					!maxPhaseContainers ||
					p.totalParticipants >
						maxPhaseContainers.phase.totalParticipants
				) {
					maxPhaseContainers = {
						phase: p,
						source: 'name' in r ? (r as { name: string }).name : '',
					};
				}
			}
		}
	}

	if (maxPhaseContainers) {
		console.log('CONTAINER GROUPS AT PEAK LOAD');
		console.log(
			`  (phase ${maxPhaseContainers.phase.phase}, ${maxPhaseContainers.phase.totalParticipants} participants, test: ${maxPhaseContainers.source})`,
		);
		console.log('-'.repeat(70));
		console.log(
			`${'Group'.padEnd(22)} ${'Count'.padEnd(8)} ${'Total CPU'.padEnd(12)} ${'Avg CPU'.padEnd(10)} ${'Total Mem'}`,
		);
		console.log('-'.repeat(70));
		for (const g of maxPhaseContainers.phase.containerGroups ?? []) {
			console.log(
				`${g.group.padEnd(22)} ${String(g.containerCount).padEnd(8)} ` +
					`${g.totalCpuPercent.toFixed(1).padEnd(9)}% ${g.avgCpuPercent.toFixed(1).padEnd(7)}% ` +
					`${g.totalMemUsageMb.toFixed(1)}MB`,
			);
		}
		console.log();
	}

	// Errors summary
	let totalErrors = 0;
	for (const r of results) {
		if ('errors' in r) {
			totalErrors += (r as BenchmarkResult).errors;
		}
	}
	if (totalErrors > 0) {
		console.log(`TOTAL ERRORS: ${totalErrors}`);
		for (const r of results) {
			if ('errors' in r && (r as BenchmarkResult).errors > 0) {
				const b = r as BenchmarkResult;
				console.log(`  ${b.name}: ${b.errors} errors`);
				const failed = b.timeline.filter(p => p.failed);
				for (const f of failed) {
					console.log(
						`    Phase ${f.phase}: ${f.failureReason ?? 'unknown'}`,
					);
				}
			}
		}
	}
}

const files = argv.slice(2);
if (files.length === 0) {
	console.error(
		'Usage: pnpm analyze:perf <result-file.json> [result-file-2.json ...]',
	);
	exit(1);
}

for (const file of files) {
	try {
		analyze(file);
	} catch (err) {
		console.error(`Error analyzing ${file}:`, err);
		exit(1);
	}
}
