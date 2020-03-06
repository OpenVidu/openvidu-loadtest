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

package io.openvidu.load.test;

import static java.lang.invoke.MethodHandles.lookup;
import static org.slf4j.LoggerFactory.getLogger;

import java.util.concurrent.atomic.AtomicBoolean;

import com.google.common.util.concurrent.AtomicDouble;

import org.slf4j.Logger;

import io.openvidu.load.test.models.MonitoringStats;
import io.openvidu.load.test.utils.OpenViduServerMonitor;
import io.openvidu.load.test.utils.ScpFileDownloader;

/**
 * Manager class for OpenVidu Server node. Collects monitoring information from
 * the machine running OpenVidu Server
 *
 * @author Pablo Fuente (pablofuenteperez@gmail.com)
 */
public class OpenViduServerManager {

	final static Logger log = getLogger(lookup().lookupClass());

	final String OPENVIDU_LOG_PATH = "/var/log/supervisor";
	final String OPENVIDU_LOG_FILENAME = "openvidu-server-stdout*.log";
	final String KMS_LOG_PATH = "/var/log/kurento-media-server";
	final String KMS_LOG_FILENAME = "20*.log";
	final String KMS_ERROR_PATH = "/var/log/kurento-media-server";
	final String KMS_ERROR_FILENAME = "errors.log";
	final String TURN_LOG_PATH = "/var/log";
	final String TURN_LOG_FILENAME = "turn_*_";

	private Thread pollingThread;
	private AtomicBoolean isInterrupted = new AtomicBoolean(false);
	private AtomicDouble cpuUsage = new AtomicDouble(0.0);
	private OpenViduServerMonitor monitor;

	public OpenViduServerManager() {
		this.monitor = new OpenViduServerMonitor(OpenViduLoadTest.SERVER_SSH_USER,
				OpenViduLoadTest.SERVER_SSH_HOSTNAME);
	}

	public void startMonitoringPolling() {
		Thread.UncaughtExceptionHandler h = new Thread.UncaughtExceptionHandler() {
			public void uncaughtException(Thread th, Throwable ex) {
				log.error("OpenVidu Server monitoring poll error");
			}
		};
		this.pollingThread = new Thread(() -> {
			while (!this.isInterrupted.get()) {
				MonitoringStats stats = this.monitor.getMonitoringStats();
				if (stats != null) {
					log.info(stats.toString());
					OpenViduLoadTest.logHelper.logServerMonitoringStats(stats);
					this.cpuUsage.set(stats.getCpuInfo());
				}
				try {
					Thread.sleep(OpenViduLoadTest.SERVER_POLL_INTERVAL);
				} catch (InterruptedException e) {
					log.debug("OpenVidu Server monitoring polling thread interrupted");
				}
			}
			log.info("OpenVidu Server monitoring poll is now stopped");
		});
		this.pollingThread.setUncaughtExceptionHandler(h);
		this.pollingThread.start();
		log.info("OpenVidu Server net, cpu and mem usage is now being monitored (in an interval of {} ms)",
				OpenViduLoadTest.SERVER_POLL_INTERVAL);
	}

	public void stopMonitoringPolling() {
		this.isInterrupted.set(true);
		this.pollingThread.interrupt();
		log.info("Stopping OpenVidu Server monitoring poll...");
	}
	
	public double getCpuUsage() {
		return this.cpuUsage.get();
	}

	public void downloadOpenViduKmsLogFiles() throws InterruptedException {
		Thread openviduLogThread = new Thread(() -> {
			ScpFileDownloader fileDownloader = new ScpFileDownloader(OpenViduLoadTest.SERVER_SSH_USER,
					OpenViduLoadTest.SERVER_SSH_HOSTNAME);
			fileDownloader.downloadFile(OPENVIDU_LOG_PATH, OPENVIDU_LOG_FILENAME, OpenViduLoadTest.RESULTS_PATH);
		});
		Thread kmsLogThread = new Thread(() -> {
			ScpFileDownloader fileDownloader = new ScpFileDownloader(OpenViduLoadTest.SERVER_SSH_USER,
					OpenViduLoadTest.SERVER_SSH_HOSTNAME);
			fileDownloader.downloadFile(KMS_LOG_PATH, KMS_LOG_FILENAME, OpenViduLoadTest.RESULTS_PATH);
		});
		Thread kmsErrorThread = new Thread(() -> {
			ScpFileDownloader fileDownloader = new ScpFileDownloader(OpenViduLoadTest.SERVER_SSH_USER,
					OpenViduLoadTest.SERVER_SSH_HOSTNAME);
			fileDownloader.downloadFile(KMS_ERROR_PATH, KMS_ERROR_FILENAME, OpenViduLoadTest.RESULTS_PATH);
		});
		Thread turnLogThread = new Thread(() -> {
			ScpFileDownloader fileDownloader = new ScpFileDownloader(OpenViduLoadTest.SERVER_SSH_USER,
					OpenViduLoadTest.SERVER_SSH_HOSTNAME);
			fileDownloader.downloadFile(TURN_LOG_PATH, TURN_LOG_FILENAME, OpenViduLoadTest.RESULTS_PATH);
		});

		// Run download threads
		openviduLogThread.start();
		kmsLogThread.start();
		kmsErrorThread.start();
		turnLogThread.start();

		// Wait for download threads to finish, with a timeout of 10 minutes
		// (10*60*1000=600000 ms)
		kmsErrorThread.join(600000);
		openviduLogThread.join(600000);
		kmsLogThread.join(600000);
		turnLogThread.join(600000);
	}
	
	public void cleanTurnLogs() {
		this.monitor.deleteAllTurnLogs();
	}

}
