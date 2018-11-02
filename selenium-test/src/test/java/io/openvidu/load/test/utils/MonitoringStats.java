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

public class MonitoringStats {

	public NetInfo netInfo;
	public double cpuInfo;
	public double[] memInro;

	public MonitoringStats(NetInfo netInfo, double cpuInfo, double[] memInro) {
		this.netInfo = netInfo;
		this.cpuInfo = cpuInfo;
		this.memInro = memInro;
	}

	public NetInfo getNetInfo() {
		return netInfo;
	}

	public double getCpuInfo() {
		return cpuInfo;
	}

	public double[] getMemInro() {
		return memInro;
	}

}
