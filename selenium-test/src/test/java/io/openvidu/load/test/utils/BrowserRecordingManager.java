/*
 * (C) Copyright 2017-2018 OpenVidu (https://openvidu.io/)
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

package io.openvidu.load.test.utils;

import static java.lang.invoke.MethodHandles.lookup;
import static org.slf4j.LoggerFactory.getLogger;

import java.io.IOException;
import java.io.InputStream;
import java.util.Properties;

import org.slf4j.Logger;

import com.jcraft.jsch.Channel;
import com.jcraft.jsch.ChannelExec;
import com.jcraft.jsch.JSch;
import com.jcraft.jsch.JSchException;
import com.jcraft.jsch.Session;

import io.openvidu.load.test.AmazonInstance;
import io.openvidu.load.test.OpenViduLoadTest;
import io.openvidu.load.test.browser.RemoteBrowserProvider;

public class BrowserRecordingManager {

	final static Logger log = getLogger(lookup().lookupClass());

	AmazonInstance amazonInstance;
	String userId;
	JSch jsch;
	Session jschSession;

	public BrowserRecordingManager(AmazonInstance amazonInstance, String userId) {
		this.amazonInstance = amazonInstance;
		this.userId = userId;

		this.jsch = new JSch();
		Properties config = new Properties();
		config.put("StrictHostKeyChecking", "no");
		config.put("PreferredAuthentications", "publickey");
		try {
			jsch.addIdentity(OpenViduLoadTest.PRIVATE_KEY_PATH);
			jschSession = jsch.getSession(OpenViduLoadTest.SERVER_SSH_USER, amazonInstance.getIp());
			jschSession.setConfig(config);
			jschSession.connect(10000);
		} catch (JSchException e) {
			log.error("Couldn't connect in 10 seconds to start browser recording to {}",
					amazonInstance.getInstanceId());
		}
	}

	public void startRecording() throws Exception {
		log.info("Starting recording of browser {} in instance {}", userId, amazonInstance.toString());
		String response = this.sendCommand("docker exec -t -d chrome start-video-recording.sh -n "
				+ RemoteBrowserProvider.RECORDING_NAME + userId);
		if (response.isEmpty()) {
			log.info("Browser {} is now being recorded", userId);
		} else {
			throw new Exception("Some error ocurred in browser instance " + userId + " when starting recording");
		}
	}

	public void stopRecording() {
		log.info("Stopping recording of browser {} in instance {}", userId, amazonInstance.toString());
		log.info("Response of stopping recording: {}",
				this.sendCommand("docker exec -t -d chrome stop-video-recording.sh"));
	}

	private String sendCommand(String command) {
		if (this.jschSession.isConnected()) {
			StringBuilder outputBuffer = new StringBuilder();
			try {
				Channel channel = jschSession.openChannel("exec");
				((ChannelExec) channel).setCommand(command);
				InputStream commandOutput = channel.getInputStream();

				StringBuilder errorBuffer = new StringBuilder();
				InputStream errorOuput = ((ChannelExec) channel).getErrStream();

				channel.connect(4000);
				int readByte = commandOutput.read();
				int errorByte = errorOuput.read();
				while (readByte != 0xffffffff) {
					outputBuffer.append((char) readByte);
					readByte = commandOutput.read();
				}
				while (errorByte != 0xffffffff) {
					errorBuffer.append((char) errorByte);
					errorByte = errorOuput.read();
				}

				if (errorBuffer.length() > 0) {
					log.error("Error sending command '{}' to {}: {}", command, amazonInstance.getIp(),
							errorBuffer.toString());
				}

				channel.disconnect();
			} catch (IOException e) {
				log.warn(e.getMessage());
				return null;
			} catch (JSchException e) {
				log.warn(e.getMessage());
				return null;
			}
			return outputBuffer.toString();
		} else {
			log.error("There's no SSH connection to instance {} of user {}. Cannot send recording command",
					amazonInstance.getInstanceId(), userId);
			return null;
		}
	}

}
