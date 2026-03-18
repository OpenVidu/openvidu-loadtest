import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
	ScriptRunnerService,
	type ScriptRunOptions,
} from '../../src/services/script-runner.service.js';
import { ChildProcess } from 'node:child_process';

// IMPORTANT: This test assumes it is running in a Linux machine.
// Using the vagrant box available in this project should suffice.
describe('ScriptRunnerService', () => {
	let service: ScriptRunnerService;

	beforeEach(() => {
		service = new ScriptRunnerService();
	});

	afterEach(async () => {
		// Clean up any remaining detached processes
		await service.killAllDetached();
	});

	describe('run', () => {
		it('should run a successful synchronous script', async () => {
			const process = await service.run('echo "test output"');
			expect(process).toBeInstanceOf(ChildProcess);
			expect(process.pid).toBeDefined();
		});

		it('should capture stdout when using callback', async () => {
			const outputs: string[] = [];
			const options: ScriptRunOptions = {
				stdoutCallback: (chunk: string) => {
					outputs.push(chunk);
				},
			};

			const process = await service.run('echo "hello"', options);
			expect(process).toBeInstanceOf(ChildProcess);
			expect(outputs.length).toBeGreaterThan(0);
			expect(outputs.join('')).toContain('hello');
		});

		it('should capture stderr', async () => {
			let capturedError = '';

			// Try to run a command that will fail
			try {
				await service.run('ls /nonexistent/path/that/does/not/exist');
			} catch (err) {
				capturedError = String(err);
			}

			expect(capturedError).toBeTruthy();
		});

		it('should reject on non-zero exit code', async () => {
			try {
				await service.run('bash -lc "exit 1"');
				expect.fail('Should have thrown an error');
			} catch (error) {
				expect(error instanceof Error).toBe(true);
				expect((error as Error).message).toContain('code 1');
			}
		});

		it('should run a detached process', async () => {
			const options: ScriptRunOptions = {
				detached: true,
			};

			const process = await service.run('sleep 30', options);
			expect(process.pid).toBeDefined();

			// Verify the process is in the cache
			const isRunning = await service.isRunning('sleep 30');
			expect(isRunning).toBe(true);

			// Clean up
			await service.killDetached(process);
		});

		it('should call onCloseCallback when process closes', async () => {
			let closeCode: number | null = null;
			const options: ScriptRunOptions = {
				onCloseCallback: (code: number | null) => {
					closeCode = code;
				},
			};

			await service.run('echo "test"', options);
			expect(closeCode).toBe(0);
		});

		it('should call onCloseCallback for failed script', async () => {
			let closeCode: number | null = null;
			const options: ScriptRunOptions = {
				onCloseCallback: (code: number | null) => {
					closeCode = code;
				},
			};

			try {
				await service.run('bash -lc "exit 5"', options);
			} catch {
				// Expected to fail
			}

			expect(closeCode).toBe(5);
		});

		it('should handle multiple arguments correctly', async () => {
			const outputs: string[] = [];
			const options: ScriptRunOptions = {
				stdoutCallback: (chunk: string) => {
					outputs.push(chunk);
				},
			};

			await service.run('printf "a b c"', options);
			const output = outputs.join('');
			expect(output).toContain('a');
			expect(output).toContain('b');
			expect(output).toContain('c');
		});
	});

	describe('killDetached', () => {
		it('should kill a detached process successfully', async () => {
			const options: ScriptRunOptions = {
				detached: true,
			};

			const process = await service.run('sleep 60', options);
			expect(process.pid).toBeDefined();

			// Verify process is running
			expect(await service.isRunning('sleep 60')).toBe(true);

			// Kill the process
			await service.killDetached(process);

			// Give the process time to die
			await new Promise(resolve => setTimeout(resolve, 1000));

			// Verify process is no longer running
			expect(await service.isRunning('sleep 60')).toBe(false);
		});

		it('should handle killing an already-dead process', async () => {
			const options: ScriptRunOptions = {
				detached: true,
			};

			const process = await service.run('sleep 1', options);
			await new Promise(resolve => setTimeout(resolve, 2000));

			// Try to kill an already-dead process
			// Should not throw an error
			await expect(service.killDetached(process)).resolves.not.toThrow();
		});

		it('should log a warning when process has no PID', async () => {
			// Create a minimal mock ChildProcess with no PID
			const mockProcess = {
				pid: undefined,
			} as unknown as ChildProcess;

			// Should handle gracefully
			await expect(
				service.killDetached(mockProcess),
			).resolves.not.toThrow();
		});
	});

	describe('killAllDetached', () => {
		it('should kill all detached processes', async () => {
			const options: ScriptRunOptions = {
				detached: true,
			};

			// Start multiple detached processes
			const process1 = await service.run('sleep 60', options);
			const process2 = await service.run('sleep 60', options);
			const process3 = await service.run('sleep 60', options);

			expect(process1.pid).toBeDefined();
			expect(process2.pid).toBeDefined();
			expect(process3.pid).toBeDefined();

			// Kill all detached processes
			await service.killAllDetached();

			// Give processes time to die
			await new Promise(resolve => setTimeout(resolve, 2000));

			// Verify all are gone
			expect(await service.isRunning('sleep 60')).toBe(false);
		});

		it('should handle killAllDetached when no processes are running', async () => {
			// Should not throw an error
			await expect(service.killAllDetached()).resolves.not.toThrow();
		});

		it('should clear the cache after killing all detached processes', async () => {
			const options: ScriptRunOptions = {
				detached: true,
			};

			await service.run('sleep 60', options);
			await service.run('sleep 60', options);

			await service.killAllDetached();

			// Start a new process - cache should be empty
			const newProcess = await service.run('sleep 60', options);
			expect(newProcess.pid).toBeDefined();

			// Should be able to kill the single remaining process
			await service.killDetached(newProcess);
		});
	});

	describe('isRunning', () => {
		it('should return true for a running detached process', async () => {
			const options: ScriptRunOptions = {
				detached: true,
			};

			await service.run('sleep 60', options);

			const isRunning = await service.isRunning('sleep');
			expect(isRunning).toBe(true);

			await service.killAllDetached();
		});

		it('should return false when query does not match any process', async () => {
			const isRunning = await service.isRunning(
				'nonexistent-process-xyz-123',
			);
			expect(isRunning).toBe(false);
		});

		it('should match processes with multiple query tokens', async () => {
			const options: ScriptRunOptions = {
				detached: true,
			};

			await service.run('sleep 60', options);

			const isRunning = await service.isRunning('sleep 60');
			expect(isRunning).toBe(true);

			await service.killAllDetached();
		});

		it('should be case-insensitive', async () => {
			const options: ScriptRunOptions = {
				detached: true,
			};

			await service.run('sleep 60', options);

			const isRunning = await service.isRunning('SLEEP');
			expect(isRunning).toBe(true);

			await service.killAllDetached();
		});

		it('should match processes with partial token matches', async () => {
			const options: ScriptRunOptions = {
				detached: true,
			};

			await service.run('sleep 60', options);

			const isRunning = await service.isRunning('slee');
			expect(isRunning).toBe(true);

			await service.killAllDetached();
		});

		it('should require all query tokens to match', async () => {
			const options: ScriptRunOptions = {
				detached: true,
			};

			await service.run('sleep 60', options);

			// Query with token that won't match
			const isRunning = await service.isRunning('sleep 120');
			expect(isRunning).toBe(false);
			// This might be true or false depending on the ps output - test the logic
			const isSleepRunning = await service.isRunning('sleep');
			expect(isSleepRunning).toBe(true);

			await service.killAllDetached();
		});
	});

	describe('Integration scenarios', () => {
		it('should handle rapid start/stop cycles', async () => {
			for (let i = 0; i < 5; i++) {
				const options: ScriptRunOptions = {
					detached: true,
				};

				const process = await service.run('sleep 5', options);
				expect(process.pid).toBeDefined();
				await service.killDetached(process);
			}

			await new Promise(resolve => setTimeout(resolve, 1000));
			expect(await service.isRunning('sleep')).toBe(false);
		});

		it('should mix detached and non-detached processes', async () => {
			const detachedProcess = await service.run('sleep 30', {
				detached: true,
			});

			const normalProcess = await service.run('echo "done"');

			expect(detachedProcess.pid).toBeDefined();
			expect(normalProcess.pid).toBeDefined();

			await service.killDetached(detachedProcess);
		});

		it('should handle process with output and callback simultaneously', async () => {
			const outputs: string[] = [];
			let closedWithCode: number | null = null;

			const options: ScriptRunOptions = {
				stdoutCallback: (chunk: string) => {
					outputs.push(chunk);
				},
				onCloseCallback: (code: number | null) => {
					closedWithCode = code;
				},
			};

			await service.run(
				String.raw`printf "line1\nline2\nline3"`,
				options,
			);

			expect(outputs.length).toBeGreaterThan(0);
			expect(closedWithCode).toBe(0);
		});

		it('should track multiple independent detached processes', async () => {
			const process1 = await service.run(
				'bash -lc "exec -a srs_case_one sleep 61"',
				{ detached: true },
			);
			await service.run('bash -lc "exec -a srs_case_two sleep 122"', {
				detached: true,
			});

			expect(await service.isRunning('srs_case_one')).toBe(true);
			expect(await service.isRunning('srs_case_two')).toBe(true);

			await service.killDetached(process1);
			expect(await service.isRunning('srs_case_one')).toBe(false);
			expect(await service.isRunning('srs_case_two')).toBe(true);

			await service.killAllDetached();
			await new Promise(resolve => setTimeout(resolve, 1000));
			expect(await service.isRunning('srs_case_one')).toBe(false);
			expect(await service.isRunning('srs_case_two')).toBe(false);
		});

		it('should capture stderr when using callback', async () => {
			const stderrChunks: string[] = [];
			const options: ScriptRunOptions = {
				stderrCallback: (chunk: string) => {
					stderrChunks.push(chunk);
				},
			};

			const process = await service.run(
				'bash -lc "echo stderr-from-test 1>&2"',
				options,
			);

			expect(process).toBeInstanceOf(ChildProcess);
			expect(stderrChunks.length).toBeGreaterThan(0);
			expect(stderrChunks.join('')).toContain('stderr-from-test');
		});

		it('should ignore stderr callback when stderrIO is not pipe', async () => {
			let callbackCalled = false;
			const options: ScriptRunOptions = {
				stdio: ['ignore', 'ignore', 'ignore'],
				stderrCallback: () => {
					callbackCalled = true;
				},
			};

			await service.run('bash -lc "echo hidden-stderr 1>&2"', options);
			expect(callbackCalled).toBe(false);
		});

		it('should honor stdinIO ignore and not block on stdin-consuming commands', async () => {
			const stdoutChunks: string[] = [];
			const options: ScriptRunOptions = {
				stdio: ['ignore', 'pipe', 'ignore'],
				stdoutCallback: (chunk: string) => {
					stdoutChunks.push(chunk);
				},
			};

			await service.run(
				'bash -lc "cat - >/dev/null; echo stdin-ignore-works"',
				options,
			);

			expect(stdoutChunks.join('')).toContain('stdin-ignore-works');
		});
	});
});
