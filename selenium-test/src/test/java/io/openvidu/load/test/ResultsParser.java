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

import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.util.Scanner;

import org.slf4j.Logger;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

public class ResultsParser {

	final static Logger log = getLogger(lookup().lookupClass());

	private final JsonParser parser = new JsonParser();

	private double numberOfPublisherEntries;
	private double numberOfSubscriberEntries;

	private double totalRtt;
	private double totalPacketsLost;
	private double totalSubscribersJitter;
	private double totalSubscribersDelay;
	private double totalSubscribersBitrate;
	private double totalPublishersBitrate;
	private double totalAvailablePublishersBandwitdh;
	private double totalAvailableSubscribersBandwitdh;

	private int averageRtt;
	private int averagePacketsLost;
	private int averageSubscribersJitter;
	private int averageSubscribersDelay;
	private int averageSubscribersBitrate;
	private int averageAvailableSubscribersBandwitdh;
	private int averagePublishersBitrate;
	private int averageAvailablePublishersBandwitdh;

	private double maxCpuUsage;
	private double maxMemUsage;
	private double totalReceivedMbs;
	private double totalSentMbs;
	private double averageReceivedBitrate;
	private double averageSentBitrate;

	private int totalUnstableBrowsers;

	private int testDuration;

	public void processResultFile() {
		FileInputStream inputStream = null;
		Scanner sc = null;
		try {
			inputStream = new FileInputStream(OpenViduLoadTest.RESULTS_PATH);
			sc = new Scanner(inputStream, "UTF-8");
			while (sc.hasNextLine()) {
				JsonObject json = parser.parse(sc.nextLine()).getAsJsonObject();
				if (json.has("event")) {
					// Test event log
					if ("testFinished".equals(json.get("event").getAsJsonObject().get("name").getAsString())) {
						this.testDuration = json.get("event").getAsJsonObject().get("secondsSinceTestStarted")
								.getAsInt();
					} else if ("sessionUnstable"
							.equals(json.get("event").getAsJsonObject().get("name").getAsString())) {
						totalUnstableBrowsers++;
					}
				} else if (json.has("stats")) {
					// OpenVidu Server monitoring log
					json = json.get("stats").getAsJsonObject();
					this.maxCpuUsage = Math.max(this.maxCpuUsage, json.get("cpu").getAsDouble());
					this.maxMemUsage = Math.max(this.maxMemUsage,
							json.get("mem").getAsJsonObject().get("percentage").getAsDouble());
					final JsonObject jsonAux = json.get("net").getAsJsonObject();
					jsonAux.entrySet().forEach(entry -> {
						JsonObject netInfo = jsonAux.get(entry.getKey()).getAsJsonObject();
						this.totalReceivedMbs = netInfo.get("rxBytes").getAsDouble();
						this.totalSentMbs = netInfo.get("txBytes").getAsDouble();
					});
				} else if (json.has("connections")) {
					// OpenVidu session info (JSON response to
					// /api/sessions/SESSION_ID?webRtcStats=true

				} else {
					// Browser WebRtc statistics log
					json.entrySet().forEach(entry1 -> {
						if (entry1.getValue().isJsonObject()) {
							entry1.getValue().getAsJsonObject().entrySet().forEach(entry2 -> {

								JsonObject stats = entry2.getValue().getAsJsonArray().get(0).getAsJsonObject();

								// Common stats for Publishers and Subscribers
								totalRtt += stats.get("rtt").getAsDouble();
								totalPacketsLost += stats.get("packetsLost").getAsDouble();

								if (stats.has("availableSendBandwidth")) {
									// Publisher stats
									numberOfPublisherEntries++;
									totalAvailablePublishersBandwitdh += stats.get("availableSendBandwidth")
											.getAsDouble();
									totalPublishersBitrate += stats.get("bitrate").getAsDouble();
								} else {
									// Subscriber stats
									numberOfSubscriberEntries++;
									totalAvailableSubscribersBandwitdh += stats.get("availableReceiveBandwidth")
											.getAsDouble();
									totalSubscribersBitrate += stats.get("bitrate").getAsDouble();
									totalSubscribersJitter += stats.get("jitter").getAsDouble();
									totalSubscribersDelay += stats.get("delay").getAsDouble();
								}
							});
						}
					});
				}
			}
			if (sc.ioException() != null) {
				log.error("Scanner IOException: {}", sc.ioException().getMessage());
			}
		} catch (FileNotFoundException e) {
			log.error("Results file not found at {}", OpenViduLoadTest.RESULTS_PATH);
		} finally {
			if (inputStream != null) {
				try {
					inputStream.close();
				} catch (IOException e) {
					log.error("Error closing input stream");
				}
			}
			if (sc != null) {
				sc.close();
			}

			this.calcAverageValues();
			this.presentResults();
		}
	}

	private void calcAverageValues() {
		this.averageRtt = (int) (this.totalRtt / (this.numberOfPublisherEntries + this.numberOfSubscriberEntries));
		this.averagePacketsLost = (int) (this.totalPacketsLost
				/ (this.numberOfPublisherEntries + this.numberOfSubscriberEntries));

		this.averageSubscribersJitter = (int) (this.totalSubscribersJitter / this.numberOfSubscriberEntries);
		this.averageSubscribersDelay = (int) (this.totalSubscribersDelay / this.numberOfSubscriberEntries);
		this.averageSubscribersBitrate = (int) (this.totalSubscribersBitrate / this.numberOfSubscriberEntries);
		this.averageAvailableSubscribersBandwitdh = (int) (this.totalAvailableSubscribersBandwitdh
				/ this.numberOfSubscriberEntries);

		this.averagePublishersBitrate = (int) (this.totalPublishersBitrate / this.numberOfPublisherEntries);
		this.averageAvailablePublishersBandwitdh = (int) (this.totalAvailablePublishersBandwitdh
				/ this.numberOfPublisherEntries);

		this.maxCpuUsage = roundTwoDecimals(this.maxCpuUsage);
		this.maxMemUsage = roundTwoDecimals(this.maxMemUsage);
		this.totalReceivedMbs = roundTwoDecimals(this.totalReceivedMbs / (1024 * 1024));
		this.totalSentMbs = roundTwoDecimals(this.totalSentMbs / (1024 * 1024));
		this.averageReceivedBitrate = (totalReceivedMbs * 1024) / testDuration;
		this.averageSentBitrate = (totalSentMbs * 1024) / testDuration;
	}

	private double roundTwoDecimals(double val) {
		return ((double) ((int) (val * 100))) / 100;
	}

	private void presentResults() {
		log.info("----------------- TEST RESULTS ---------------");
		log.info("Test duration: {} s", testDuration);
		log.info("Total unstable browsers: {}", totalUnstableBrowsers);
		log.info("------- WebRTC streams stats -------");
		log.info("Average WebRTC RTT: {} ms", averageRtt);
		log.info("Average WebRTC packets lost: {}", averagePacketsLost);
		log.info("Average WebRTC subscribers Jitter: {}", averageSubscribersJitter);
		log.info("Average WebRTC subscribers delay: {} ms", averageSubscribersDelay);
		log.info("Average WebRTC subscribers bitrate: {} KB/s", averageSubscribersBitrate);
		log.info("Average WebRTC publishers bitrate: {} KB/s", averagePublishersBitrate);
		log.info("Average WebRTC available receive bandwidth: {}", averageAvailableSubscribersBandwitdh);
		log.info("Average WebRTC available send bandwidth: {}", averageAvailablePublishersBandwitdh);
		log.info("------- OpenVidu Server monitoring -------");
		log.info("Max CPU usage in OpenVidu Server: {}", maxCpuUsage);
		log.info("Max memory usage in OpenVidu Server: {}", maxMemUsage);
		log.info("Total recevied MBs by OpenVidu Server: {} MB", totalReceivedMbs);
		log.info("Total sent MBs by OpenVidu Server: {} MB", totalSentMbs);
		log.info("Average received bitrate by OpenVidu Server: {} KB/s", averageReceivedBitrate);
		log.info("Average sent bitrate by OpenVidu Server: {}  KB/s", averageSentBitrate);
		log.info("----------------------------------------------");
	}

}
