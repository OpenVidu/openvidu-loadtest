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

import java.util.Map.Entry;

import com.google.gson.JsonObject;

import io.openvidu.load.test.OpenViduLoadTest;
import io.openvidu.load.test.models.NetInfo.NetInfoEntry;

public class MonitoringStats {

	private NetInfo netInfo;
	private double cpuInfo;
	private double[] memInfo;
	private long timestamp;

	public MonitoringStats(NetInfo netInfo, double cpuInfo, double[] memInfo, long timestamp) {
		this.netInfo = netInfo;
		this.cpuInfo = cpuInfo;
		this.memInfo = memInfo;
		this.timestamp = timestamp;
	}

	public NetInfo getNetInfo() {
		return netInfo;
	}

	public double getCpuInfo() {
		return cpuInfo;
	}

	public double[] getMemInfo() {
		return memInfo;
	}

	public long getTimestamp() {
		return timestamp;
	}

	@Override
	public String toString() {
		return this.timestamp + " - " + this.netInfo.toString() + ", " + " CpuUsage [" + this.cpuInfo + "], "
				+ "MemUsage [used: " + this.memInfo[0] + ", percentage: " + this.memInfo[1] + "]]";
	}

	public JsonObject toJson() {
		JsonObject json = new JsonObject();
		JsonObject stats = new JsonObject();

		// net
		JsonObject net = new JsonObject();
		for (Entry<String, NetInfoEntry> entry : this.netInfo.getNetInfoMap().entrySet()) {
			JsonObject netJson = new JsonObject();
			netJson.addProperty("rxBytes", entry.getValue().getRxBytes());
			netJson.addProperty("txBytes", entry.getValue().getTxBytes());
			net.add(entry.getKey(), netJson);
		}
		stats.add("net", net);

		// cpu
		stats.addProperty("cpu", this.cpuInfo);

		// mem
		JsonObject mem = new JsonObject();
		mem.addProperty("used", this.memInfo[0]);
		mem.addProperty("percentage", this.memInfo[1]);
		stats.add("mem", mem);

		json.add("stats", stats);
		json.addProperty("secondsSinceTestStarted",
				(System.currentTimeMillis() - OpenViduLoadTest.timeTestStarted) / 1000);
		json.addProperty("timestamp", this.timestamp);

		return json;
	}

}
