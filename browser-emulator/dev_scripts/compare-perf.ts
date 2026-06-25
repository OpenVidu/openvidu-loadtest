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
	cpu: number | null;
	memoryRssMb: number | null;
	creationLatencyMs: number | null;
	failed: boolean;
	processProfiles?: ProcessProfile[];
	perfFiles?: PerfRecordFile[];
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

function load(file: string): PerfRunOutput {
	const raw = readFileSync(file, 'utf8');
	return JSON.parse(raw) as PerfRunOutput;
}

function findByName<T extends { name: string }>(
	results: T[],
	name: string,
): T | undefined {
	return results.find(r => r.name === name);
}

function avgProcessCpu(timeline: PhaseRecord[]): number | null {
	const cpus = timeline
		.flatMap(p => p.processProfiles ?? [])
		.map(pp => pp.cpuPct)
		.filter((v): v is number => v !== null);
	return cpus.length > 0
		? cpus.reduce((a, b) => a + b, 0) / cpus.length
		: null;
}

function avgCtxSwitches(
	timeline: PhaseRecord[],
	type: 'voluntary' | 'nonvoluntary',
): number | null {
	const values = timeline
		.flatMap(p => p.processProfiles ?? [])
		.map(pp =>
			type === 'voluntary' ? pp.voluntaryCtxSw : pp.nonvoluntaryCtxSw,
		)
		.filter((v): v is number => v !== null);
	return values.length > 0
		? Math.round(values.reduce((a, b) => a + b, 0) / values.length)
		: null;
}

const files = argv.slice(2);
if (files.length !== 2) {
	console.error('Usage: pnpm compare:perf <baseline.json> <comparison.json>');
	exit(1);
}

const [baseFile, compFile] = files;
const base = load(baseFile);
const comp = load(compFile);

const baseMode =
	(base.results.find(r => 'launcherMode' in r) as BenchmarkResult | undefined)
		?.launcherMode ?? '?';
const compMode =
	(comp.results.find(r => 'launcherMode' in r) as BenchmarkResult | undefined)
		?.launcherMode ?? '?';

console.log('COMPARISON');
console.log(
	`  Baseline:   ${base.runId} (${base.timestamp}) [mode=${baseMode}]`,
);
console.log(
	`  Comparison: ${comp.runId} (${comp.timestamp}) [mode=${compMode}]`,
);
console.log(
	`  System:     ${base.system.cpus} CPUs / ${base.system.totalMemoryGb}GB -> ${comp.system.cpus} CPUs / ${comp.system.totalMemoryGb}GB`,
);
console.log();

const baseBenchmarks = base.results.filter(
	r => 'creationLatencyMs' in r,
) as BenchmarkResult[];
const compBenchmarks = comp.results.filter(
	r => 'creationLatencyMs' in r,
) as BenchmarkResult[];
const baseSaturations = base.results.filter(
	r => 'ceiling' in r,
) as SaturationResult[];
const compSaturations = comp.results.filter(
	r => 'ceiling' in r,
) as SaturationResult[];

if (baseBenchmarks.length > 0 || compBenchmarks.length > 0) {
	console.log('BENCHMARKS');
	console.log('-'.repeat(80));
	for (const b of baseBenchmarks) {
		const c = findByName(compBenchmarks, b.name);
		if (!c) {
			console.log(`  ${b.name}: REMOVED in comparison`);
			continue;
		}
		const bLat = b.creationLatencyMs;
		const cLat = c.creationLatencyMs;
		const p50Diff = cLat.p50 - bLat.p50;
		const p95Diff = cLat.p95 - bLat.p95;
		const p99Diff = cLat.p99 - bLat.p99;
		const avgDiff = cLat.avg - bLat.avg;
		const errDiff = c.errors - b.errors;

		const arrow = (diff: number): string =>
			diff > 0 ? '↑' : diff < 0 ? '↓' : '—';
		const regress = (diff: number): string =>
			diff > 0 ? ' ✗' : diff < 0 ? ' ✓' : '';

		console.log(`  ${b.name}`);
		console.log(
			`    p50:  ${bLat.p50}ms -> ${cLat.p50}ms  ${arrow(p50Diff)}${regress(p50Diff)} (${p50Diff > 0 ? '+' : ''}${p50Diff}ms)`,
		);
		console.log(
			`    p95:  ${bLat.p95}ms -> ${cLat.p95}ms  ${arrow(p95Diff)}${regress(p95Diff)} (${p95Diff > 0 ? '+' : ''}${p95Diff}ms)`,
		);
		console.log(
			`    p99:  ${bLat.p99}ms -> ${cLat.p99}ms  ${arrow(p99Diff)}${regress(p99Diff)} (${p99Diff > 0 ? '+' : ''}${p99Diff}ms)`,
		);
		console.log(
			`    avg:  ${bLat.avg.toFixed(1)}ms -> ${cLat.avg.toFixed(1)}ms  ${arrow(avgDiff)}${regress(avgDiff)} (${avgDiff > 0 ? '+' : ''}${avgDiff.toFixed(1)}ms)`,
		);
		console.log(
			`    err:  ${b.errors} -> ${c.errors}  ${errDiff > 0 ? '✗ NEW ERRORS' : errDiff < 0 ? '✓ FIXED' : '—'}`,
		);

		// Per-process CPU comparison
		const bCpu = avgProcessCpu(b.timeline);
		const cCpu = avgProcessCpu(c.timeline);
		const bVol = avgCtxSwitches(b.timeline, 'voluntary');
		const cVol = avgCtxSwitches(c.timeline, 'voluntary');
		const bNv = avgCtxSwitches(b.timeline, 'nonvoluntary');
		const cNv = avgCtxSwitches(c.timeline, 'nonvoluntary');

		if (bCpu !== null || cCpu !== null) {
			const cpuDiff = cCpu !== null && bCpu !== null ? cCpu - bCpu : null;
			const volDiff = cVol !== null && bVol !== null ? cVol - bVol : null;
			const nvDiff = cNv !== null && bNv !== null ? cNv - bNv : null;

			console.log(
				`    cpu:  ${bCpu !== null ? bCpu.toFixed(1) + '%' : '-'} -> ${cCpu !== null ? cCpu.toFixed(1) + '%' : '-'}  ${cpuDiff !== null ? (cpuDiff > 0 ? `↑ +${cpuDiff.toFixed(1)}%` : cpuDiff < 0 ? `↓ ${cpuDiff.toFixed(1)}%` : '—') : ''}`,
			);
			console.log(
				`    vCtx: ${bVol !== null ? String(bVol) : '-'} -> ${cVol !== null ? String(cVol) : '-'}  ${volDiff !== null ? (volDiff > 0 ? `↑ +${volDiff}` : volDiff < 0 ? `↓ ${volDiff}` : '—') : ''}`,
			);
			console.log(
				`    nvCtx:${bNv !== null ? String(bNv) : '-'} -> ${cNv !== null ? String(cNv) : '-'}  ${nvDiff !== null ? (nvDiff > 0 ? `↑ +${nvDiff}` : nvDiff < 0 ? `↓ ${nvDiff}` : '—') : ''}`,
			);
		}

		console.log();
	}

	// New benchmarks in comparison
	for (const c of compBenchmarks) {
		if (!findByName(baseBenchmarks, c.name)) {
			console.log(`  ${c.name}: NEW (not in baseline)`);
			console.log();
		}
	}
}

if (baseSaturations.length > 0 || compSaturations.length > 0) {
	console.log('SATURATION');
	console.log('-'.repeat(80));
	for (const b of baseSaturations) {
		const c = findByName(compSaturations, b.name);
		if (!c) {
			console.log(`  ${b.name}: REMOVED in comparison`);
			continue;
		}
		const bCeil = b.ceiling.firstFailedParticipants;
		const cCeil = c.ceiling.firstFailedParticipants;
		const ceilDiff =
			cCeil !== null && bCeil !== null ? cCeil - bCeil : null;

		const bSust = b.ceiling.sustained100Participants;
		const cSust = c.ceiling.sustained100Participants;

		const bCpus = b.timeline
			.map(p => p.cpu)
			.filter((v): v is number => v !== null);
		const cCpus = c.timeline
			.map(p => p.cpu)
			.filter((v): v is number => v !== null);
		const bPeak = bCpus.length > 0 ? Math.max(...bCpus) : 0;
		const cPeak = cCpus.length > 0 ? Math.max(...cCpus) : 0;

		console.log(`  ${b.name}`);
		console.log(
			`    ceiling:  ${bCeil ?? '—'} -> ${cCeil ?? '—'}  ${ceilDiff !== null ? (ceilDiff > 0 ? `↑ +${ceilDiff} ✓` : ceilDiff < 0 ? `↓ ${ceilDiff} ✗` : '—') : '—'}`,
		);
		console.log(`    sustained: ${bSust ?? '—'} -> ${cSust ?? '—'}`);
		console.log(
			`    cpu peak: ${bPeak.toFixed(1)}% -> ${cPeak.toFixed(1)}%  ${cPeak > bPeak ? '↑' : cPeak < bPeak ? '↓' : '—'}`,
		);
		console.log();
	}

	for (const c of compSaturations) {
		if (!findByName(baseSaturations, c.name)) {
			console.log(`  ${c.name}: NEW (not in baseline)`);
			console.log();
		}
	}
}
