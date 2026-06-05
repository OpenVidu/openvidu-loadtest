import { describe, expect, it } from 'vitest';
import { findOggAudioDataOffset } from '../../src/services/streaming/socket-writer.service.js';

function createOggPage(packet: Buffer): Buffer {
	return createOggPageFromPackets([packet]);
}

function createOggPageFromPackets(packets: Buffer[]): Buffer {
	for (const packet of packets) {
		if (packet.length > 255) {
			throw new Error(
				'Test helper only supports packets up to 255 bytes',
			);
		}
	}

	const header = Buffer.alloc(27);
	header.write('OggS', 0, 'ascii');
	header[4] = 0; // stream structure version
	header[5] = 0; // header type
	header.writeBigUInt64LE(0n, 6); // granule position
	header.writeUInt32LE(1, 14); // bitstream serial number
	header.writeUInt32LE(0, 18); // page sequence
	header.writeUInt32LE(0, 22); // checksum (unused in this parser)
	header[26] = packets.length;

	const lacingTable = Buffer.from(packets.map(packet => packet.length));
	const payload = Buffer.concat(packets);
	return Buffer.concat([header, lacingTable, payload]);
}

describe('findOggAudioDataOffset', () => {
	it('returns the start of first audio page after Opus headers', () => {
		const opusHead = Buffer.from('OpusHead-demo', 'ascii');
		const opusTags = Buffer.from('OpusTags-demo', 'ascii');
		const audioPacket = Buffer.from([0xf8, 0xff, 0xfe, 0xfd]);

		const page1 = createOggPage(opusHead);
		const page2 = createOggPage(opusTags);
		const page3 = createOggPage(audioPacket);
		const oggData = Buffer.concat([page1, page2, page3]);

		const expectedOffset = page1.length + page2.length;
		expect(findOggAudioDataOffset(oggData)).toBe(expectedOffset);
	});

	it('returns the page boundary even when OpusTags and audio share a page', () => {
		const opusHead = Buffer.from('OpusHead-demo', 'ascii');
		const opusTags = Buffer.from('OpusTags-demo', 'ascii');
		const audioPacket = Buffer.from([0xf8, 0xff, 0xfe, 0xfd]);

		const page1 = createOggPage(opusHead);
		const page2 = createOggPageFromPackets([opusTags, audioPacket]);
		const oggData = Buffer.concat([page1, page2]);

		expect(findOggAudioDataOffset(oggData)).toBe(page1.length);
	});

	it('returns 0 when buffer is not an Ogg stream', () => {
		expect(findOggAudioDataOffset(Buffer.from('not-ogg', 'ascii'))).toBe(0);
	});
});
