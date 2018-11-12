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

package io.openvidu.load.test.browser;

/**
 * Browser generic properties. Customize the type of browser, its identification
 * fields, testing configuration parameters, recording status and network
 * conditions
 *
 * @author Pablo Fuente (pablofuenteperez@gmail.com)
 */
public class BrowserProperties {

	private String type;
	private String sessionId;
	private String userId;
	private int timeOfWaitInSeconds;
	private boolean isRecorded;
	private NetworkRestriction networkRestriction;

	public static class Builder {

		private String type = "chrome";
		private String sessionId;
		private String userId;
		private int timeOfWaitInSeconds = 40;
		private boolean isRecorded = false;
		private NetworkRestriction networkRestriction = NetworkRestriction.ALL_OPEN;

		public BrowserProperties build() {
			return new BrowserProperties(this.type, this.sessionId, this.userId, this.timeOfWaitInSeconds,
					this.isRecorded, this.networkRestriction);
		}

		public BrowserProperties.Builder type(String type) {
			this.type = type;
			return this;
		}

		public BrowserProperties.Builder sessionId(String sessionId) {
			this.sessionId = sessionId;
			return this;
		}

		public BrowserProperties.Builder userId(String userId) {
			this.userId = userId;
			return this;
		}

		public BrowserProperties.Builder timeOfWaitInSeconds(int timeOfWaitInSeconds) {
			this.timeOfWaitInSeconds = timeOfWaitInSeconds;
			return this;
		}

		public BrowserProperties.Builder isRecorded(boolean isRecorded) {
			this.isRecorded = isRecorded;
			return this;
		}

		public BrowserProperties.Builder networkRestriction(NetworkRestriction networkRestriction) {
			this.networkRestriction = networkRestriction;
			return this;
		}
	}

	public BrowserProperties(String type, String sessionId, String userId, int timeOfWaitInSeconds, boolean isRecorded,
			NetworkRestriction networkRestriction) {
		super();
		this.type = type;
		this.sessionId = sessionId;
		this.userId = userId;
		this.timeOfWaitInSeconds = timeOfWaitInSeconds;
		this.isRecorded = isRecorded;
		this.networkRestriction = networkRestriction;
	}

	public String type() {
		return this.type;
	}

	public String sessionId() {
		return this.sessionId;
	}

	public String userId() {
		return this.userId;
	}

	public int timeOfWaitInSeconds() {
		return this.timeOfWaitInSeconds;
	}

	public boolean isRecorded() {
		return this.isRecorded;
	}

	public NetworkRestriction networkRestriction() {
		return this.networkRestriction;
	}

	public void changeRecordedConfig(boolean isRecorded) {
		this.isRecorded = isRecorded;
	}

	public void changeNetworkingRestrictionConfig(NetworkRestriction networkRestriction) {
		this.networkRestriction = networkRestriction;
	}

}
