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

import org.openqa.selenium.remote.DesiredCapabilities;

/**
 * Exception thrown by RemoteBrowserProvider when browser inside EC2 machine
 * wasn't reachable in the specified timeout
 *
 * @author Pablo Fuente (pablofuenteperez@gmail.com)
 */
public class BrowserNotReadyException extends Exception {

	private static final long serialVersionUID = 1L;

	private String instanceId;
	private BrowserProperties properties;
	private DesiredCapabilities capabilities;

	public BrowserNotReadyException(String instanceId, BrowserProperties properties, DesiredCapabilities capabilities,
			String message) {
		super(message);
		this.instanceId = instanceId;
		this.properties = properties;
		this.capabilities = capabilities;
	}

	public String getInstanceId() {
		return instanceId;
	}

	public BrowserProperties getProperties() {
		return properties;
	}

	public DesiredCapabilities getCapabilities() {
		return capabilities;
	}

}
