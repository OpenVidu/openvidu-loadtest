/*
 * (C) Copyright 2017-2019 ElasTest (http://elastest.io/)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
function ElasTestRemoteControl() {
	this.recordRTC = null;
}

function calculateBitsPerSecond(frameRate, resolution) {
	var splitted = resolution.split("x");
	var width = parseInt(splitted[0]);
	var height = parseInt(splitted[1]);
	var bitsPerPixel = 24;
	return frameRate * width * height * bitsPerPixel;
}

ElasTestRemoteControl.prototype.startRecording = function(stream, frameRate, resolution) {
	var options = {
		type : "video",
		mimeType : "video/webm",
		frameRate: !!frameRate ? frameRate : 30,
		numberOfAudioChannels : 2,
		sampleRate : 48000,
		bitsPerSecond: calculateBitsPerSecond(frameRate, resolution),
	};
	this.recordRTC = new RecordRTCPromisesHandler(stream, options);
	this.recordRTC.startRecording();
}

ElasTestRemoteControl.prototype.stopRecording = async function() {
	if (!this.recordRTC) {
		console.warn("No recording found.");
	} else {
		if (this.recordRTC.length) {
			const url = await this.recordRTC[0].stopRecording();
			if (!this.recordRTC[1]) {
				console.info("[0] Recorded track: " + url);
				return;
			}
			const url2 = await this.recordRTC[1].stopRecording();
			console.info("[1] Recorded track: " + url2);
		} else {
			const url = await this.recordRTC.stopRecording();
			console.info("Recorded track: " + url);
		}
	}
}

ElasTestRemoteControl.prototype.saveRecordingToDisk = function(fileName) {
	if (!this.recordRTC) {
		console.warn("No recording found.");
	} else {
		var output = this.recordRTC.save(fileName);
		console.info(output);
	}
}

ElasTestRemoteControl.prototype.openRecordingInNewTab = function() {
	if (!this.recordRTC) {
		console.warn("No recording found.");
	} else {
		window.open(this.recordRTC.toURL());
	}
}

ElasTestRemoteControl.prototype.recordingToData = async function() {
	if (!this.recordRTC) {
		console.warn("No recording found.");
	} else {
		return await this.recordRTC.getBlob();
	}
}

ElasTestRemoteControl.prototype.getState = function() {
	if (!this.recordRTC) {
		console.warn("No recording found.");
	} else {
		return this.recordRTC.getState();
	}
}