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

interface PhaseRecord {
	phase: number;
	totalParticipants: number;
	cpu: number | null;
	memoryRssMb: number | null;
	creationLatencyMs: number | null;
	failed: boolean;
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

const files = argv.slice(2);
if (files.length !== 2) {
	console.error('Usage: pnpm compare:perf <baseline.json> <comparison.json>');
	exit(1);
}

const [baseFile, compFile] = files;
const base = load(baseFile);
const comp = load(compFile);

console.log('COMPARISON');
console.log(`  Baseline:   ${base.runId} (${base.timestamp})`);
console.log(`  Comparison: ${comp.runId} (${comp.timestamp})`);
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
