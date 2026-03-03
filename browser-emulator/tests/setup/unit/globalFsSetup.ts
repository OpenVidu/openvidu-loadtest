import { beforeEach, vi } from 'vitest';
import { vol } from 'memfs';

export const MOCK_CWD = '/opt/openvidu-loadtest/browser-emulator';

vi.spyOn(process, 'cwd').mockReturnValue(MOCK_CWD);

vi.mock('node:fs', async () => {
	const { fs } = await import('memfs');
	return { default: fs };
});

vi.mock('node:fs/promises', async () => {
	const { fs } = await import('memfs');
	return { default: fs.promises };
});

beforeEach(() => {
	vol.reset();
	vol.mkdirSync(MOCK_CWD, { recursive: true });
});
