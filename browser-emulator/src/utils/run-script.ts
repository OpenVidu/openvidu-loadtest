import { spawn } from 'child_process';

export async function runScript(script: string, detached: boolean = false): Promise<string> {
    console.log(script);
    const promise: Promise<string> = new Promise((resolve, reject) => {
        const execProcess = spawn(script, [], {
            cwd: `${process.env.PWD}`,
            shell: "/bin/bash",
            detached
        });
        execProcess.stdout.on('data', (data) => {
            console.log(data.toString());
        });
        execProcess.stderr.on('data', (data) => {
            console.error(data.toString());
        });
        execProcess.on('exit', (code) => {
            if (code !== 0) {
                console.error(`exit code ${code}`);
                return reject({
                    error: code
                });
            } else {
                return resolve("");
            }
        });
    })
    return promise
}