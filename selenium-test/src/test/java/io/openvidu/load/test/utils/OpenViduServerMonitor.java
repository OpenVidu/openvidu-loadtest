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

import org.slf4j.Logger;

import com.jcraft.jsch.Channel;
import com.jcraft.jsch.ChannelExec;
import com.jcraft.jsch.JSch;
import com.jcraft.jsch.JSchException;
import com.jcraft.jsch.Session;

public class OpenViduServerMonitor {

	final static Logger log = getLogger(lookup().lookupClass());

	private Session session;

	public OpenViduServerMonitor(String username, String hostname, int port) {
		try {
			JSch jsch = new JSch();
			this.session = jsch.getSession(username, hostname, port);
		} catch (JSchException e) {
			log.error("Error connecting ssh session to OpenVidu Server for monitoring purposes: {}", e.getMessage());
		}
	}
	
	public MonitoringStats getMonitoringStats() {
		// TODO
		return null;
	}

	public NetInfo getNetInfo() {
		NetInfo netInfo = new NetInfo();
		String out = runAndWait("/bin/sh", "-c", "cat /proc/net/dev | awk 'NR > 2'");

		String[] lines = out.split("\n");
		for (String line : lines) {
			String[] split = line.trim().replaceAll(" +", " ").split(" ");
			String iface = split[0].replace(":", "");
			long rxBytes = Long.parseLong(split[1]);
			long txBytes = Long.parseLong(split[9]);
			netInfo.putNetInfo(iface, rxBytes, txBytes);
		}
		if (initNetInfo == null) {
			initNetInfo = netInfo;
		}
		netInfo.decrementInitInfo(initNetInfo);
		return netInfo;
	}

	protected double getCpuUsage() {
		String[] cpu = runAndWait("/bin/sh", "-c",
				"cat /proc/stat | grep '^cpu ' | awk '{print substr($0, index($0, $2))}'").replaceAll("\n", "")
						.split(" ");

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

	protected double[] getMem() {
		String[] mem = runAndWait("free").replaceAll("\n", ",").replaceAll(" +", " ").split(" ");

		long usedMem = Long.parseLong(mem[15]);
		long totalMem = Long.parseLong(mem[7]);

		double percetageMem = (double) usedMem / (double) totalMem * 100;

		if (Double.isNaN(percetageMem)) {
			percetageMem = 0;
		}

		double[] out = { usedMem, percetageMem };
		return out;
	}

	/*protected int getKmsPid() {
		System.out.println("Looking for KMS process...");
	
		boolean reachable = false;
		long endTimeMillis = System.currentTimeMillis() + KMS_WAIT_TIMEOUT * 1000;
	
		String kmsPid;
		while (true) {
			kmsPid = runAndWait("/bin/sh", "-c",
					"ps axf | grep /usr/bin/kurento-media-server | grep -v grep | awk '{print $1}'").replaceAll("\n",
							"");
			reachable = !kmsPid.equals("");
			if (kmsPid.contains(" ")) {
				throw new RuntimeException("More than one KMS process are started (PIDs:" + kmsPid + ")");
			}
			if (reachable) {
				break;
			}
	
			// Poll time to wait host (1 second)
			try {
				Thread.sleep(TimeUnit.SECONDS.toMillis(1));
			} catch (InterruptedException ie) {
				ie.printStackTrace();
			}
			if (System.currentTimeMillis() > endTimeMillis) {
				break;
			}
		}
		if (!reachable) {
			throw new RuntimeException("KMS is not started in the local machine");
		}
	
		System.out.println("KMS process located in local machine with PID " + kmsPid);
		return Integer.parseInt(kmsPid);
	}*/
	
	/*protected int getNumThreads() {
		return Integer.parseInt(
				runAndWait("/bin/sh", "-c", "cat /proc/" + kmsPid + "/stat | awk '{print $20}'").replaceAll("\n", ""));
	}*/

	private String sendCommand(String command) {
		StringBuilder outputBuffer = new StringBuilder();
		try {
			Channel channel = this.session.openChannel("exec");
			((ChannelExec) channel).setCommand(command);
			InputStream commandOutput = channel.getInputStream();
			channel.connect();
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
	}

}
