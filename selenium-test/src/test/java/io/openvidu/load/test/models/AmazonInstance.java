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

package io.openvidu.load.test.models;

/**
 * Amazon EC2 instance representation (instance id and ip)
 *
 * @author Pablo Fuente (pablofuenteperez@gmail.com)
 */
public class AmazonInstance {

	private String instanceId;
	private String publicIp;
	private String privateIp;

	public AmazonInstance(String instanceId, String publicIp, String privateIp) {
		this.instanceId = instanceId;
		this.publicIp = publicIp;
		this.privateIp = privateIp;
	}

	public String getInstanceId() {
		return this.instanceId;
	}

	public String getPublicIp() {
		return this.publicIp;
	}

	public String getPrivateIp() {
		return this.privateIp;
	}

	@Override
	public String toString() {
		return "{id: \"" + this.instanceId + "\", publicIp: \"" + this.publicIp + "\", privateIp: \"" + this.privateIp
				+ "\"}";
	}

}
