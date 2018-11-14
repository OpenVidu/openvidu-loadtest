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

import io.openvidu.load.test.OpenViduLoadTest;
import io.openvidu.load.test.models.MonitoringStats;
import io.openvidu.load.test.models.NetInfo;

/**
 * Monitoring service for Linux machines. Gathers CPU, memory and network usage
 * through SSH
 *
 * @author Pablo Fuente (pablofuenteperez@gmail.com)
 */
public class OpenViduServerMonitor {

	final static Logger log = getLogger(lookup().lookupClass());

	private Session session;

	final String NET_COMMAND = "cat /proc/net/dev | awk 'NR > 2'";
	final String CPU_COMMAND = "cat /proc/stat | grep '^cpu ' | awk '{print substr($0, index($0, $2))}'";
	final String MEM_COMMAND = "free";
	final String TIMESTAMP_COMMAND = "echo $(($(date +%s%N)/1000000))";
	final String JOIN_COMMAND = " && echo '%%' && ";
	final String FULL_COMMAND = NET_COMMAND + JOIN_COMMAND + CPU_COMMAND + JOIN_COMMAND + MEM_COMMAND + JOIN_COMMAND
			+ TIMESTAMP_COMMAND;

	private double prevTotal = 0;
	private double prevIdle = 0;
	private NetInfo initNetInfo;

	JSch jsch;
	String username;
	String hostname;

	public OpenViduServerMonitor(String username, String hostname) {
		this.username = username;
		this.hostname = hostname;
		try {
			this.jsch = new JSch();
			Properties config = new Properties();
			config.put("StrictHostKeyChecking", "no");
			config.put("PreferredAuthentications", "publickey");
			jsch.addIdentity(OpenViduLoadTest.PRIVATE_KEY_PATH);

			this.session = jsch.getSession(username, hostname, 22);
			session.setConfig(config);
			session.connect();
		} catch (JSchException e) {
			log.error("Error connecting ssh session to OpenVidu Server for monitoring purposes: {}", e.getMessage());
		}
	}

	public MonitoringStats getMonitoringStats() {
		String result = sendCommand(FULL_COMMAND);
		if (result != null) {
			String[] rawStats = result.split("%%");
			NetInfo netInfo = parseNetInfo(rawStats[0].trim());
			double cpuUsage = parseCpuUsage(rawStats[1].trim());
			double[] memUsage = parseMemUsage(rawStats[2].trim());
			long timestamp = Long.parseLong(rawStats[3].trim());
			return new MonitoringStats(netInfo, cpuUsage, memUsage, timestamp);
		} else {
			log.error("Monitoring stats couldn't be retrieved");
			return null;
		}
	}

	public boolean deleteAllTurnLogs() {
		log.info("Cleaning COTURN logs in OpenVidu Server");
		String result = sendCommand("sudo rm /var/log/turn_*");
		if (result != null && result.isEmpty()) {
			log.info("COTURN logs cleaned up in OpenVidu Server");
			return true;
		} else {
			return false;
		}
	}

	private String sendCommand(String command) {
		if (this.session.isConnected()) {
			StringBuilder outputBuffer = new StringBuilder();
			try {
				Channel channel = session.openChannel("exec");
				((ChannelExec) channel).setCommand(command);
				InputStream commandOutput = channel.getInputStream();
				channel.connect(4000);
				int readByte = commandOutput.read();
				while (readByte != 0xffffffff) {
					outputBuffer.append((char) readByte);
					readByte = commandOutput.read();
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
			try {
				this.session = this.jsch.getSession(username, hostname, 22);
			} catch (JSchException e) {
				log.error("Error connecting ssh session to OpenVidu Server for monitoring purposes: {}",
						e.getMessage());
			}
			return null;
		}
	}

	private NetInfo parseNetInfo(String rawNetInfo) {
		String[] lines = rawNetInfo.split("\n");
		NetInfo netInfo = new NetInfo();
		for (String line : lines) {
			String[] split = line.trim().replaceAll(" +", " ").split(" ");
			String iface = split[0].replace(":", "");
			if (!"lo".equals(iface) && !"docker0".equals(iface) && !iface.startsWith("br-")) {
				// Ignore local and docker interfaces
				long rxBytes = Long.parseLong(split[1]);
				long txBytes = Long.parseLong(split[9]);
				netInfo.putNetInfo(iface, rxBytes, txBytes);
			}
		}
		if (initNetInfo == null) {
			initNetInfo = new NetInfo(netInfo);
		}
		netInfo.decrementInitInfo(initNetInfo);
		return netInfo;
	}

	private double parseCpuUsage(String rawCpuUsage) {
		String[] cpu = rawCpuUsage.replaceAll("\n", "").split(" ");
		double idle = Double.parseDouble(cpu[3]);
		double total = 0;
		for (String s : cpu) {
			total += Double.parseDouble(s);
		}
		double diffIdle = idle - prevIdle;
		double diffTotal = total - prevTotal;
		double diffUsage = (1000 * (diffTotal - diffIdle) / diffTotal + 5) / 10;

		prevTotal = total;
		prevIdle = idle;

		return diffUsage;
	}

	private double[] parseMemUsage(String rawMemUsage) {
		String[] mem = rawMemUsage.replaceAll("\n", ",").replaceAll(" +", " ").split(" ");
		long totalMem = Long.parseLong(mem[6]);
		long usedMem = Long.parseLong(mem[7]);
		double percetageMem = (double) usedMem / (double) totalMem * 100;

		if (Double.isNaN(percetageMem)) {
			percetageMem = 0;
		}
		double[] out = { usedMem, percetageMem };
		return out;
	}

}
