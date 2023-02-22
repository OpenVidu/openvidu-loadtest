import { ChildProcess, spawn, exec } from 'child_process';
import fs = require('fs');

const detachedPids: number[] = [];

export async function runScript(script: string, options?: {
    detached?: boolean,
    ignoreLogs?: boolean,
    redirectStdoutToFile?: string,
    stdoutCallback?: ((chunk: any) => void)
}): Promise<string | ChildProcess> {
    console.log(script);
    const promise: Promise<string | ChildProcess> = new Promise((resolve, reject) => {
        const execProcess = spawn(script, [], {
            cwd: `${process.env.PWD}`,
            shell: "/bin/bash",
            detached: !!options ? !!options.detached ? options.detached : false : false,
            stdio: !!options ? !!options.ignoreLogs ? 'ignore' : 'pipe' : 'pipe'
        });
        if (!!options && !!options.detached && options.detached) {
            detachedPids.push(execProcess.pid);
            resolve(execProcess);
        } else {
                if (!!options && !!options.redirectStdoutToFile) {
                    execProcess.stdout.pipe(fs.createWriteStream(options.redirectStdoutToFile));
                } else if (!!options && !!options.stdoutCallback) {
                    execProcess.stdout.on('data', options.stdoutCallback);
                } else{
                    execProcess.stdout.on('data', (data) => {
                        console.log(data.toString());
                    });
                }
            execProcess.stderr.on('data', (data) => {
                console.log(data.toString());
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
        }
    })
    return promise;
}

export function stopDetached(pid: number) {
    try {
        console.log("Stopping " + pid);
        process.kill(-pid, "SIGINT");
    } catch (err) {
        try {
            console.log("Retrying stopping " + pid);
            process.kill(pid, "SIGINT");
        } catch (err2) {
            console.error(err);
            console.error(err2);
        }
    }
}

export function killAllDetached() {
    console.log("PIDs to kill: " + detachedPids);
    detachedPids.forEach(pid => {
        try {
            console.log("Killing " + pid);
            process.kill(-pid);
        } catch (err) {
            try {
                console.log("Retrying killing " + pid);
                process.kill(pid);
            } catch (err2) {
                console.error(err);
                console.error(err2);
            }
        }
    });
}

export async function isRunning(query: string) {
    let cmd = `ps -Awwf`;
    return new Promise((resolve, reject) => 
        exec(cmd, (err, stdout, stderr) => {
            if (err) reject(err);
            const condition = stdout.toLowerCase().indexOf(query.toLowerCase()) > -1;
            resolve(condition);
        })
    );
}