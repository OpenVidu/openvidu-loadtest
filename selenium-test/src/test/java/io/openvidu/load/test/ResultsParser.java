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

import java.io.File;
import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.Writer;
import java.nio.channels.Channels;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Scanner;

import org.slf4j.Logger;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

public class ResultsParser {

	final static Logger log = getLogger(lookup().lookupClass());
	private File file;
	private FileOutputStream outputStream;
	private Writer writer;

	private final JsonParser parser = new JsonParser();
	private int numberOfLines;
	public int numberOfBrowsersReached;

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

	private int maxRtt;
	private int maxPacketsLost;
	private int maxSubscribersJitter;
	private int maxSubscribersDelay;

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

		Path resultPath = Paths.get(OpenViduLoadTest.RESULTS_PATH);
		String directory = resultPath.getParent().toString();

		this.file = new File(directory, "loadTestResults.csv");
		boolean alreadyExists = this.file.exists();
		int fileIndex = 1;
		while (alreadyExists) {
			this.file = new File(directory, "loadTestResults-" + fileIndex + ".csv");
			alreadyExists = this.file.exists();
			fileIndex++;
		}
		try {
			this.outputStream = new FileOutputStream(file.getAbsoluteFile(), true);
			this.writer = Channels.newWriter(outputStream.getChannel(), "UTF-8");
		} catch (FileNotFoundException e) {
			log.error("CSV results file couldn't be created at {}. Error: {}", directory + "/loadTestResults.csv",
					e.getMessage());
		}

		try {
			inputStream = new FileInputStream(OpenViduLoadTest.RESULTS_PATH);
			sc = new Scanner(inputStream, "UTF-8");
			while (sc.hasNextLine()) {
				numberOfLines++;
				JsonObject json = parser.parse(sc.nextLine()).getAsJsonObject();
				if (json.has("event")) {
					// Test event log
					String eventName = json.get("event").getAsJsonObject().get("name").getAsString();
					switch (eventName) {
					case "testFinished":
						this.testDuration = json.get("event").getAsJsonObject().get("secondsSinceTestStarted")
								.getAsInt();
						break;
					case "connectedToBrowser":
						numberOfBrowsersReached++;
						break;
					case "sessionUnstable":
						totalUnstableBrowsers++;
						break;
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

								JsonArray array = entry2.getValue().getAsJsonArray();

								if (array.size() > 0) {
									JsonObject stats = array.get(0).getAsJsonObject();
									try {
										// Common stats for Publishers and Subscribers
										maxRtt = Math.max(maxRtt, stats.get("rtt").getAsInt());
										totalRtt += stats.get("rtt").getAsDouble();
										maxPacketsLost = Math.max(maxPacketsLost, stats.get("packetsLost").getAsInt());
										totalPacketsLost += stats.get("packetsLost").getAsDouble();

										if (stats.has("availableSendBandwidth")) {
											// Publisher stats
											numberOfPublisherEntries++;
											totalAvailablePublishersBandwitdh += stats.get("availableSendBandwidth")
													.getAsDouble();
											totalPublishersBitrate += stats.get("bitrate").getAsDouble();
										} else if (stats.has("availableReceiveBandwidth")) {
											// Subscriber stats
											numberOfSubscriberEntries++;
											totalAvailableSubscribersBandwitdh += stats.get("availableReceiveBandwidth")
													.getAsDouble();
											totalSubscribersBitrate += stats.get("bitrate").getAsDouble();

											maxSubscribersJitter = Math.max(maxSubscribersJitter,
													stats.get("jitter").getAsInt());
											maxSubscribersDelay = Math.max(maxSubscribersDelay,
													stats.get("delay").getAsInt());

											totalSubscribersJitter += stats.get("jitter").getAsDouble();
											totalSubscribersDelay += stats.get("delay").getAsDouble();
										}
										StringBuilder sb = new StringBuilder(500);

										// TODO sb.append();

										try {
											writeCsvLine(sb);
										} catch (IOException e) {
											log.error("Couldn't write WebRTC stat in CSV file: {}", e.getMessage());
										}
									} catch (UnsupportedOperationException exc) {
										log.error("Error reading value from log entry in line {}: {}. {}",
												numberOfLines, exc.getMessage(), exc.getStackTrace());
									}
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
			// Close IputStream
			if (inputStream != null) {
				try {
					inputStream.close();
				} catch (IOException e) {
					log.error("Error closing input stream");
				}
			}
			// Close Scanner
			if (sc != null) {
				sc.close();
			}
			// Close OutputStream
			if (outputStream != null) {
				try {
					outputStream.close();
				} catch (IOException e) {
					log.error("Error closing output stream");
				}
			}

			// Close Writer
			if (writer != null) {
				try {
					this.writer.close();
				} catch (IOException e) {
					log.error("Error closing CSV writer");
				}
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
		this.averageReceivedBitrate = roundTwoDecimals((totalReceivedMbs * 1024) / testDuration);
		this.averageSentBitrate = roundTwoDecimals((totalSentMbs * 1024) / testDuration);
	}

	private double roundTwoDecimals(double val) {
		return ((double) ((int) (val * 100))) / 100;
	}

	private void presentResults() {
		log.info("----------------- TEST RESULTS ---------------");
		log.info("Test duration: {} s", testDuration);
		log.info("Number of browsers reached: {} of {}", numberOfBrowsersReached,
				OpenViduLoadTest.SESSIONS * OpenViduLoadTest.USERS_SESSION);
		log.info("Total unstable browsers: {}", totalUnstableBrowsers);
		log.info("Number of lines parsed from log: {}", numberOfLines);
		log.info("------- WebRTC streams stats -------");
		log.info("Average WebRTC RTT: {} ms", averageRtt);
		log.info("Average WebRTC packets lost: {}", averagePacketsLost);
		log.info("Average WebRTC subscribers Jitter: {}", averageSubscribersJitter);
		log.info("Average WebRTC subscribers delay: {} ms", averageSubscribersDelay);
		log.info("Average WebRTC subscribers bitrate: {} KB/s", averageSubscribersBitrate);
		log.info("Average WebRTC publishers bitrate: {} KB/s", averagePublishersBitrate);
		log.info("Average WebRTC available receive bandwidth: {}", averageAvailableSubscribersBandwitdh);
		log.info("Average WebRTC available send bandwidth: {}", averageAvailablePublishersBandwitdh);
		log.info("Max WebRTC RTT: {}", maxRtt);
		log.info("Max WebRTC packets lost: {}", maxPacketsLost);
		log.info("Max WebRTC subscribers Jitter: {}", maxSubscribersJitter);
		log.info("Max WebRTC subscribers delay: {}", maxSubscribersDelay);
		log.info("------- OpenVidu Server monitoring -------");
		log.info("Max CPU usage in OpenVidu Server: {}", maxCpuUsage);
		log.info("Max memory usage in OpenVidu Server: {}", maxMemUsage);
		log.info("Total received MBs by OpenVidu Server: {} MB", totalReceivedMbs);
		log.info("Total sent MBs by OpenVidu Server: {} MB", totalSentMbs);
		log.info("Average received bitrate by OpenVidu Server: {} KB/s", averageReceivedBitrate);
		log.info("Average sent bitrate by OpenVidu Server: {} KB/s", averageSentBitrate);
		log.info("----------------------------------------------");
	}

	private void writeCsvLine(StringBuilder sb) throws IOException {
		this.writer.append(sb);
	}

}
