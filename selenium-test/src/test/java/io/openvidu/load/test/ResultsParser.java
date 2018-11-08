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
import java.util.Scanner;

import org.slf4j.Logger;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.google.gson.JsonSyntaxException;

import io.openvidu.load.test.utils.LogHelper;

/**
 * Processes tests's standard log file to obtain final results
 *
 * @author Pablo Fuente (pablofuenteperez@gmail.com)
 */
public class ResultsParser {

	final static Logger log = getLogger(lookup().lookupClass());

	private LogHelper logHelper;

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

	public ResultsParser(LogHelper logHelper) {
		this.logHelper = logHelper;
	}

	public void processResultFile() {
		FileInputStream inputStream = null;
		Scanner sc = null;

		this.file = new File(OpenViduLoadTest.RESULTS_PATH, "loadTestResults.csv");
		try {
			this.outputStream = new FileOutputStream(file.getAbsoluteFile(), true);
			this.writer = Channels.newWriter(outputStream.getChannel(), "UTF-8");
		} catch (FileNotFoundException e) {
			log.error("CSV results file couldn't be created at {}. Error: {}",
					OpenViduLoadTest.RESULTS_PATH + "/loadTestResults.csv", e.getMessage());
		}

		try {
			inputStream = new FileInputStream(OpenViduLoadTest.RESULTS_PATH + "/" + LogHelper.testLogFilename);
			sc = new Scanner(inputStream, "UTF-8");
			while (sc.hasNextLine()) {
				numberOfLines++;
				JsonObject json = null;
				String nextLine = sc.nextLine();
				try {
					json = parser.parse(nextLine).getAsJsonObject();
				} catch(JsonSyntaxException ex) {
					log.error("Line {} is not a JSON object: {}", numberOfLines, nextLine);
					continue;
				}
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
		String testInfo = System.getProperty("line.separator") + "----------------- TEST RESULTS ---------------"
				+ System.getProperty("line.separator") + "Test duration: " + testDuration + " s"
				+ System.getProperty("line.separator") + "Number of browsers reached: " + numberOfBrowsersReached
				+ " of " + OpenViduLoadTest.SESSIONS * OpenViduLoadTest.USERS_SESSION
				+ System.getProperty("line.separator") + "Total unstable browsers: " + totalUnstableBrowsers
				+ System.getProperty("line.separator") + "Number of lines parsed from log: " + numberOfLines
				+ System.getProperty("line.separator") + "------- WebRTC streams stats -------"
				+ System.getProperty("line.separator") + "Average WebRTC RTT: " + averageRtt + " ms"
				+ System.getProperty("line.separator") + "Average WebRTC packets lost: " + averagePacketsLost
				+ System.getProperty("line.separator") + "Average WebRTC subscribers Jitter: "
				+ averageSubscribersJitter + System.getProperty("line.separator") + "Average WebRTC subscribers delay: "
				+ averageSubscribersDelay + " ms" + System.getProperty("line.separator")
				+ "Average WebRTC subscribers bitrate: " + averageSubscribersBitrate + " KB/s"
				+ System.getProperty("line.separator") + "Average WebRTC publishers bitrate: "
				+ averagePublishersBitrate + " KB/s" + System.getProperty("line.separator")
				+ "Average WebRTC available receive bandwidth: " + averageAvailableSubscribersBandwitdh
				+ System.getProperty("line.separator") + "Average WebRTC available send bandwidth: "
				+ averageAvailablePublishersBandwitdh + System.getProperty("line.separator") + "Max WebRTC RTT: "
				+ maxRtt + System.getProperty("line.separator") + "Max WebRTC packets lost: " + maxPacketsLost
				+ System.getProperty("line.separator") + "Max WebRTC subscribers Jitter: " + maxSubscribersJitter
				+ System.getProperty("line.separator") + "Max WebRTC subscribers delay: " + maxSubscribersDelay + " ms"
				+ System.getProperty("line.separator") + "------- OpenVidu Server monitoring -------"
				+ System.getProperty("line.separator") + "Max CPU usage in OpenVidu Server: " + maxCpuUsage + "%"
				+ System.getProperty("line.separator") + "Max memory usage in OpenVidu Server: " + maxMemUsage + "%"
				+ System.getProperty("line.separator") + "Total received MBs by OpenVidu Server: " + totalReceivedMbs
				+ " MB" + System.getProperty("line.separator") + "Total sent MBs by OpenVidu Server: " + totalSentMbs
				+ " MB" + System.getProperty("line.separator") + "Average received bitrate by OpenVidu Server: "
				+ averageReceivedBitrate + " KB/s" + System.getProperty("line.separator")
				+ "Average sent bitrate by OpenVidu Server: " + averageSentBitrate + " KB/s"
				+ System.getProperty("line.separator") + "----------------------------------------------";

		this.logHelper.logTestInfo(testInfo);
		log.info(testInfo);
	}

	private void writeCsvLine(StringBuilder sb) throws IOException {
		this.writer.append(sb);
	}

}
