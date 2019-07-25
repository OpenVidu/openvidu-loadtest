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

import java.io.BufferedWriter;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.FileWriter;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.List;
import java.util.Map.Entry;
import java.util.Scanner;
import java.util.stream.Collectors;

import org.slf4j.Logger;

import com.google.common.collect.HashBasedTable;
import com.google.common.collect.Table;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.google.gson.JsonSyntaxException;

import io.openvidu.load.test.utils.CommandExecutor;
import io.openvidu.load.test.utils.LogHelper;
import io.pkts.PacketHandler;
import io.pkts.Pcap;
import io.pkts.packet.IPPacket;
import io.pkts.packet.Packet;
import io.pkts.packet.TransportPacket;
import io.pkts.protocol.Protocol;

/**
 * Processes tests's standard log file to obtain final results
 *
 * @author Pablo Fuente (pablofuenteperez@gmail.com)
 */
public class ResultsParser {

	final static Logger log = getLogger(lookup().lookupClass());

	private LogHelper logHelper;

	private File csvFileSubscribers;
	private BufferedWriter writerSubscribers;

	private File csvAverageFileSubscribers;
	private BufferedWriter writerAverageSubscribers;

	private File csvFilePublishers;
	private BufferedWriter writerPublishers;

	private File csvAverageFilePublishers;
	private BufferedWriter writerAveragePublishers;

	private File packetsFile;
	private BufferedWriter writerPackets;

	private final JsonParser parser = new JsonParser();
	private int numberOfLines;
	public int numberOfBrowsersReached;

	private double numberOfPublisherEntries;
	private double numberOfSubscriberEntries;

	private int initialTime = -1;
	private double totalSubscriberRtt;
	private double totalPublisherRtt;
	private double totalSubscriberPacketsLost;
	private double totalPublisherPacketsLost;
	private double totalSubscriberJitter;
	private double totalSubscriberDelay;
	private double totalSubscriberBitrate;
	private double totalPublisherBitrate;
	private double totalAvailablePublisherBandwitdh;
	private double totalAvailableSubscriberBandwitdh;
	private double totalSubscriberFramesDecoded;

	private int maxSubscriberRtt;
	private int maxPublisherRtt;
	private int maxSubscriberPacketsLost;
	private int maxPublisherPacketsLost;
	private int maxSubscriberJitter;
	private int maxSubscriberDelay;

	private int averageSubscriberRtt;
	private int averagePublisherRtt;
	private int averageSubscriberPacketsLost;
	private int averagePublisherPacketsLost;
	private int averageSubscriberJitter;
	private int averageSubscriberDelay;
	private int averageSubscriberBitrate;
	private int averagePublisherBitrate;
	private int averageAvailableSubscriberBandwitdh;
	private int averageSubscriberFramesDecoded;
	private int averageAvailablePublisherBandwitdh;

	private double maxCpuUsage;
	private double maxMemUsage;
	private double lastCpuUsage;
	private double lastMemUsage;
	private double totalReceivedMbs;
	private double totalSentMbs;
	private double averageReceivedBitrate;
	private double averageSentBitrate;

	private int totalUnstableBrowsers;

	private int testDuration;

	public ResultsParser(LogHelper logHelper) {
		this.logHelper = logHelper;
	}

	public void processLoadTestStats() {
		FileInputStream inputStream = null;
		Scanner sc = null;

		this.csvFileSubscribers = new File(OpenViduLoadTest.RESULTS_PATH, "loadTestSubscriberResults.csv");
		this.csvAverageFileSubscribers = new File(OpenViduLoadTest.RESULTS_PATH,
				"loadTestSubscriberResultsAverage.csv");
		this.csvFilePublishers = new File(OpenViduLoadTest.RESULTS_PATH, "loadTestPublisherResults.csv");
		this.csvAverageFilePublishers = new File(OpenViduLoadTest.RESULTS_PATH, "loadTestPublisherResultsAverage.csv");
		this.packetsFile = new File(OpenViduLoadTest.RESULTS_PATH, "packetsInfo.txt");
		try {
			// Subscribers results
			this.writerSubscribers = new BufferedWriter(
					new FileWriter(csvFileSubscribers.getAbsoluteFile().toString(), true));
			writeCsvLineSubscribers(
					"time,rtt,bitrate,jitter,delay,packetsLost,availableReceiveBandwidth,framesDecoded");
			this.writerAverageSubscribers = new BufferedWriter(
					new FileWriter(csvAverageFileSubscribers.getAbsoluteFile().toString(), true));
			writeCsvAverageLineSubscribers(
					"time,browsers,rtt,bitrate,jitter,delay,packetsLost,availableReceiveBandwidth,framesDecoded,cpu,mem");
			// Publisher results
			this.writerPublishers = new BufferedWriter(
					new FileWriter(csvFilePublishers.getAbsoluteFile().toString(), true));
			writeCsvLinePublishers("time,rtt,bitrate,packetsLost,availableSendBandwidth");
			this.writerAveragePublishers = new BufferedWriter(
					new FileWriter(csvAverageFilePublishers.getAbsoluteFile().toString(), true));
			writeCsvAverageLinePublishers("time,browsers,rtt,bitrate,packetsLost,availableSendBandwidth,cpu,mem");
			// Packets results
			this.writerPackets = new BufferedWriter(new FileWriter(packetsFile.getAbsoluteFile().toString(), true));
		} catch (IOException e) {
			log.error("CSV results file couldn't be created at {}. Error: {}",
					OpenViduLoadTest.RESULTS_PATH + "/loadTestSubscriberResults.csv", e.getMessage());
		}

		try {
			inputStream = new FileInputStream(OpenViduLoadTest.RESULTS_PATH + "/" + LogHelper.testLogFilename);
			sc = new Scanner(inputStream, "UTF-8");

			int currentSeconds = -1;
			int countSameTimeSubscribers = 0;
			int countSameTimePublishers = 0;

			int averageRttSubscribers = 0;
			int averageBitrateSubscribers = 0;
			int averageJitterSubscribers = 0;
			int averageDelaySubscribers = 0;
			int averagePacketLostSubscribers = 0;
			int averageAvailableReceiveBandwidthSubscribers = 0;
			int averageFramesDecodedSubscribers = 0;

			int averageRttPublishers = 0;
			int averageBitratePublishers = 0;
			int averagePacketLostPublishers = 0;
			int averageAvailableSendBandwidthPublishers = 0;

			while (sc.hasNextLine()) {
				numberOfLines++;
				JsonObject json = null;
				String nextLine = sc.nextLine();
				try {
					json = parser.parse(nextLine).getAsJsonObject();
				} catch (JsonSyntaxException ex) {
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
					double cpu = json.get("cpu").getAsDouble();
					double mem = json.get("mem").getAsJsonObject().get("percentage").getAsDouble();
					this.lastCpuUsage = cpu;
					this.lastMemUsage = mem;
					this.maxCpuUsage = Math.max(this.maxCpuUsage, cpu);
					this.maxMemUsage = Math.max(this.maxMemUsage, mem);
					final JsonObject jsonAux = json.get("net").getAsJsonObject();
					jsonAux.entrySet().forEach(entry -> {
						JsonObject netInfo = jsonAux.get(entry.getKey()).getAsJsonObject();
						this.totalReceivedMbs = netInfo.get("rxBytes").getAsDouble();
						this.totalSentMbs = netInfo.get("txBytes").getAsDouble();
					});
				} else if (json.has("connections")) {
					// OpenVidu session info (JSON response to
					// /api/sessions/SESSION_ID?webRtcStats=true)

				} else {
					// Browser WebRtc statistics log
					final int secondsSinceTestStarted = json.get("secondsSinceTestStarted").getAsInt();
					if (initialTime == -1) {
						initialTime = secondsSinceTestStarted;
					}
					boolean newTime = false;
					if (currentSeconds == -1) {
						currentSeconds = secondsSinceTestStarted;
					}
					if (currentSeconds != secondsSinceTestStarted) {
						newTime = true;
					}

					for (Entry<String, JsonElement> entry1 : json.entrySet()) {
						if (entry1.getValue().isJsonObject()) {
							for (Entry<String, JsonElement> entry2 : entry1.getValue().getAsJsonObject().entrySet()) {

								JsonArray array = entry2.getValue().getAsJsonArray();

								if (array.size() > 0) {
									JsonObject stats = array.get(0).getAsJsonObject();
									try {

										if (stats.has("availableSendBandwidth")) {
											// Publisher stats
											numberOfPublisherEntries++;

											int rtt = stats.get("rtt").getAsInt();
											int bitrate = stats.get("bitrate").getAsInt();
											int packetsLost = stats.get("packetsLost").getAsInt();
											int availableSendBandwidth = stats.get("availableSendBandwidth").getAsInt();

											maxPublisherRtt = Math.max(maxPublisherRtt, rtt);
											totalPublisherRtt += rtt;
											maxPublisherPacketsLost = Math.max(maxPublisherPacketsLost, packetsLost);
											totalPublisherPacketsLost += packetsLost;
											totalAvailablePublisherBandwitdh += availableSendBandwidth;
											totalPublisherBitrate += bitrate;

											countSameTimePublishers++;
											averageRttPublishers += rtt;
											averageBitratePublishers += bitrate;
											averagePacketLostPublishers += packetsLost;
											averageAvailableSendBandwidthPublishers += availableSendBandwidth;

											StringBuilder sb = new StringBuilder(200);
											sb.append(secondsSinceTestStarted - initialTime);
											sb.append(",");
											sb.append(rtt);
											sb.append(",");
											sb.append(bitrate);
											sb.append(",");
											sb.append(packetsLost);
											sb.append(",");
											sb.append(availableSendBandwidth);
											try {
												writeCsvLinePublishers(sb.toString());
											} catch (IOException e) {
												log.error("Couldn't write WebRTC stat in CSV file: {}", e.getMessage());
											}

										} else if (stats.has("availableReceiveBandwidth")) {
											// Subscriber stats
											numberOfSubscriberEntries++;

											int rtt = stats.get("rtt").getAsInt();
											int bitrate = stats.get("bitrate").getAsInt();
											int jitter = stats.get("jitter").getAsInt();
											int delay = stats.get("delay").getAsInt();
											int packetsLost = stats.get("packetsLost").getAsInt();
											int availableReceiveBandwidth = stats.get("availableReceiveBandwidth")
													.getAsInt();
											int framesDecoded = stats.get("framesDecoded").getAsInt();

											maxSubscriberRtt = Math.max(maxSubscriberRtt, rtt);
											totalSubscriberRtt += rtt;
											maxSubscriberPacketsLost = Math.max(maxSubscriberPacketsLost, packetsLost);
											totalSubscriberPacketsLost += packetsLost;
											totalAvailableSubscriberBandwitdh += availableReceiveBandwidth;
											totalSubscriberFramesDecoded += framesDecoded;
											totalSubscriberBitrate += bitrate;

											maxSubscriberJitter = Math.max(maxSubscriberJitter, jitter);
											maxSubscriberDelay = Math.max(maxSubscriberDelay, delay);

											totalSubscriberJitter += stats.get("jitter").getAsDouble();
											totalSubscriberDelay += stats.get("delay").getAsDouble();

											countSameTimeSubscribers++;
											averageRttSubscribers += rtt;
											averageBitrateSubscribers += bitrate;
											averageJitterSubscribers += jitter;
											averageDelaySubscribers += delay;
											averagePacketLostSubscribers += packetsLost;
											averageAvailableReceiveBandwidthSubscribers += availableReceiveBandwidth;
											averageFramesDecodedSubscribers += framesDecoded;

											StringBuilder sb = new StringBuilder(200);
											sb.append(secondsSinceTestStarted - initialTime);
											sb.append(",");
											sb.append(rtt);
											sb.append(",");
											sb.append(bitrate);
											sb.append(",");
											sb.append(jitter);
											sb.append(",");
											sb.append(delay);
											sb.append(",");
											sb.append(packetsLost);
											sb.append(",");
											sb.append(availableReceiveBandwidth);
											sb.append(",");
											sb.append(framesDecoded);
											try {
												writeCsvLineSubscribers(sb.toString());
											} catch (IOException e) {
												log.error("Couldn't write WebRTC stat in CSV file: {}", e.getMessage());
											}
										}
									} catch (UnsupportedOperationException exc) {
										log.error("Error reading value from log entry in line {}: {}. {}",
												numberOfLines, exc.getMessage(), exc.getStackTrace());
									}
								}
							}
						}
					}

					if (newTime) {
						// Average subscriber entry
						StringBuilder sb = new StringBuilder(200);
						sb.append(currentSeconds - initialTime);
						sb.append(",");
						sb.append(numberOfBrowsersReached);
						sb.append(",");
						sb.append(averageRttSubscribers / countSameTimeSubscribers);
						sb.append(",");
						sb.append(averageBitrateSubscribers / countSameTimeSubscribers);
						sb.append(",");
						sb.append(averageJitterSubscribers / countSameTimeSubscribers);
						sb.append(",");
						sb.append(averageDelaySubscribers / countSameTimeSubscribers);
						sb.append(",");
						sb.append(averagePacketLostSubscribers / countSameTimeSubscribers);
						sb.append(",");
						sb.append(averageAvailableReceiveBandwidthSubscribers / countSameTimeSubscribers);
						sb.append(",");
						sb.append(averageFramesDecodedSubscribers / countSameTimeSubscribers);
						sb.append(",");
						sb.append((int) lastCpuUsage);
						sb.append(",");
						sb.append((int) lastMemUsage);
						try {
							writeCsvAverageLineSubscribers(sb.toString());
						} catch (IOException e) {
							log.error("Couldn't write WebRTC stat in CSV average file: {}", e.getMessage());
						}
						averageRttSubscribers = 0;
						averageBitrateSubscribers = 0;
						averageJitterSubscribers = 0;
						averageDelaySubscribers = 0;
						averagePacketLostSubscribers = 0;
						averageAvailableReceiveBandwidthSubscribers = 0;
						averageFramesDecodedSubscribers = 0;
						countSameTimeSubscribers = 0;

						// Average publisher entry
						sb = new StringBuilder(200);
						sb.append(currentSeconds - initialTime);
						sb.append(",");
						sb.append(numberOfBrowsersReached);
						sb.append(",");
						sb.append(averageRttPublishers / countSameTimePublishers);
						sb.append(",");
						sb.append(averageBitratePublishers / countSameTimePublishers);
						sb.append(",");
						sb.append(averagePacketLostPublishers / countSameTimePublishers);
						sb.append(",");
						sb.append(averageAvailableSendBandwidthPublishers / countSameTimePublishers);
						sb.append(",");
						sb.append((int) lastCpuUsage);
						sb.append(",");
						sb.append((int) lastMemUsage);
						try {
							writeCsvAverageLinePublishers(sb.toString());
						} catch (IOException e) {
							log.error("Couldn't write WebRTC stat in CSV average file: {}", e.getMessage());
						}
						averageRttPublishers = 0;
						averageBitratePublishers = 0;
						averagePacketLostPublishers = 0;
						averageAvailableSendBandwidthPublishers = 0;
						countSameTimePublishers = 0;

						currentSeconds = secondsSinceTestStarted;
						newTime = false;
					}
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

			// Close BufferedWriters
			closeWriter(writerSubscribers);
			closeWriter(writerAverageSubscribers);
			closeWriter(writerPublishers);
			closeWriter(writerAveragePublishers);

			this.calcAverageValues();
			this.presentResults();
			this.generateGraphsWithR();
		}
	}

	public void processTcpdumps() {
		try {
			List<String> tcpdumpFiles = Files
					.find(Paths.get(OpenViduLoadTest.RESULTS_PATH), 100, (p, a) -> p.toString().endsWith(".pcap"))
					.map(path -> path.getFileName().toString()).collect(Collectors.toList());

			for (String file : tcpdumpFiles) {

				Table<String, String, Integer> packetsTable = HashBasedTable.create();
				final Pcap pcap = Pcap.openStream(OpenViduLoadTest.RESULTS_PATH + "/" + file);

				try {
					pcap.loop(new PacketHandler() {
						@Override
						public boolean nextPacket(final Packet packet) throws IOException {

							String fullProtocolStack = "";

							// Layer 3: [IPv4, IPv6] (not processed: ICMP, ICMP6, IGMP, ARP)
							IPPacket ipPacket = null;
							if (packet.hasProtocol(Protocol.IPv4)) {
								ipPacket = (IPPacket) packet.getPacket(Protocol.IPv4);
								fullProtocolStack += Protocol.IPv4.getName();
							} else if (packet.hasProtocol(Protocol.IPv6)) {
								ipPacket = (IPPacket) packet.getPacket(Protocol.IPv6);
								fullProtocolStack += Protocol.IPv6.getName();
							}

							// Layer 4: [TCP, UDP, SCTP]
							TransportPacket transportPacket = null;
							if (packet.hasProtocol(Protocol.TCP)) {
								transportPacket = (TransportPacket) packet.getPacket(Protocol.TCP);
								fullProtocolStack = fullProtocolStack.isEmpty() ? "" : fullProtocolStack + "-";
								fullProtocolStack += Protocol.TCP.getName();
							} else if (packet.hasProtocol(Protocol.UDP)) {
								transportPacket = (TransportPacket) packet.getPacket(Protocol.UDP);
								fullProtocolStack = fullProtocolStack.isEmpty() ? "" : fullProtocolStack + "-";
								fullProtocolStack += Protocol.UDP.getName();
							} else if (packet.hasProtocol(Protocol.SCTP)) {
								transportPacket = (TransportPacket) packet.getPacket(Protocol.SCTP);
								fullProtocolStack = fullProtocolStack.isEmpty() ? "" : fullProtocolStack + "-";
								fullProtocolStack += Protocol.SCTP.getName();
							}

							// Layer 7 (directly extends layer 4 in pkts library): [TLS, SIP, SDP, RTP,
							// RTCP]
							if (packet.hasProtocol(Protocol.SDP)) {
								fullProtocolStack = fullProtocolStack.isEmpty() ? "" : fullProtocolStack + "-";
								fullProtocolStack += Protocol.SDP.getName();
							} else if (packet.hasProtocol(Protocol.RTP)) {
								fullProtocolStack = fullProtocolStack.isEmpty() ? "" : fullProtocolStack + "-";
								fullProtocolStack += Protocol.RTP.getName();
							} else if (packet.hasProtocol(Protocol.RTCP)) {
								fullProtocolStack = fullProtocolStack.isEmpty() ? "" : fullProtocolStack + "-";
								fullProtocolStack += Protocol.RTCP.getName();
							}

							if (ipPacket != null && transportPacket != null) {
								String key = ipPacket.getSourceIP() + ":" + transportPacket.getSourcePort() + ">"
										+ ipPacket.getDestinationIP() + ":" + transportPacket.getDestinationPort();
								Integer val = packetsTable.get(key, fullProtocolStack);
								val = val == null ? 1 : (val + 1);
								packetsTable.put(key, fullProtocolStack, val);
							}

							return true;
						}
					});
					log.info(file + ": " + packetsTable.toString());
					writePacketsLine(file + ": " + packetsTable.toString());
				} catch (Exception e) {
					log.error("File {} generated an error while packet processing. Error: {}",
							OpenViduLoadTest.RESULTS_PATH + "/" + file, e.getMessage());
				}
			}
		} catch (IOException e) {
			log.error("Couldn't list tcpdump files in path {}. No further processing of tcpdump files",
					OpenViduLoadTest.RESULTS_PATH);
			return;
		} finally {
			closeWriter(writerPackets);
		}
	}

	private void calcAverageValues() {
		this.averageSubscriberRtt = (int) (this.totalSubscriberRtt / this.numberOfSubscriberEntries);
		this.averageSubscriberPacketsLost = (int) (this.totalSubscriberPacketsLost / this.numberOfSubscriberEntries);
		this.averageSubscriberBitrate = (int) (this.totalSubscriberBitrate / this.numberOfSubscriberEntries);
		this.averageAvailableSubscriberBandwitdh = (int) (this.totalAvailableSubscriberBandwitdh
				/ this.numberOfSubscriberEntries);
		this.averageSubscriberFramesDecoded = (int) (this.totalSubscriberFramesDecoded
				/ this.numberOfSubscriberEntries);
		this.averageSubscriberJitter = (int) (this.totalSubscriberJitter / this.numberOfSubscriberEntries);
		this.averageSubscriberDelay = (int) (this.totalSubscriberDelay / this.numberOfSubscriberEntries);

		this.averagePublisherRtt = (int) (this.totalPublisherRtt / this.numberOfPublisherEntries);
		this.averagePublisherPacketsLost = (int) (this.totalPublisherPacketsLost / this.numberOfPublisherEntries);
		this.averagePublisherBitrate = (int) (this.totalPublisherBitrate / this.numberOfPublisherEntries);
		this.averageAvailablePublisherBandwitdh = (int) (this.totalAvailablePublisherBandwitdh
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
				+ System.getProperty("line.separator") + "Average WebRTC receiver RTT: " + averageSubscriberRtt + " ms"
				+ System.getProperty("line.separator") + "Average WebRTC sender RTT: " + averagePublisherRtt + " ms"
				+ System.getProperty("line.separator") + "Average WebRTC receiver packets lost: "
				+ averageSubscriberPacketsLost + System.getProperty("line.separator")
				+ "Average WebRTC sender packets lost: " + averagePublisherPacketsLost
				+ System.getProperty("line.separator") + "Average WebRTC receiver Jitter: " + averageSubscriberJitter
				+ System.getProperty("line.separator") + "Average WebRTC receiver delay: " + averageSubscriberDelay
				+ " ms" + System.getProperty("line.separator") + "Average WebRTC receiver bitrate: "
				+ averageSubscriberBitrate + " kbps" + System.getProperty("line.separator")
				+ "Average WebRTC sender bitrate: " + averagePublisherBitrate + " kbps"
				+ System.getProperty("line.separator") + "Average WebRTC available receive bandwidth: "
				+ averageAvailableSubscriberBandwitdh + System.getProperty("line.separator")
				+ System.getProperty("line.separator") + "Average WebRTC receiver frames decoded: "
				+ averageSubscriberFramesDecoded + System.getProperty("line.separator")
				+ "Average WebRTC available send bandwidth: " + averageAvailablePublisherBandwitdh
				+ System.getProperty("line.separator") + "Max WebRTC receiver RTT: " + maxSubscriberRtt
				+ System.getProperty("line.separator") + "Max WebRTC sender RTT: " + maxPublisherRtt
				+ System.getProperty("line.separator") + "Max WebRTC receiver packets lost: " + maxSubscriberPacketsLost
				+ System.getProperty("line.separator") + "Max WebRTC sender packets lost: " + maxPublisherPacketsLost
				+ System.getProperty("line.separator") + "Max WebRTC receiver Jitter: " + maxSubscriberJitter
				+ System.getProperty("line.separator") + "Max WebRTC receiver delay: " + maxSubscriberDelay + " ms"
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

	private void generateGraphsWithR() {
		log.info("Generating graphs with R");
		if (CommandExecutor.executeCommand("which R").isEmpty()) {
			log.error("Cannot generate graphs. R is not installed");
			return;
		}
		File Rscript = new File(getClass().getClassLoader().getResource("generateGraphs.R").getFile());
		CommandExecutor.executeCommand("chmod 777 " + Rscript.getAbsolutePath());
		CommandExecutor.executeCommand("Rscript " + Rscript.getAbsolutePath() + " " + OpenViduLoadTest.RESULTS_PATH);
	}

	private void writeCsvLineSubscribers(String line) throws IOException {
		this.writerSubscribers.append(line + System.lineSeparator());
	}

	private void writeCsvAverageLineSubscribers(String line) throws IOException {
		this.writerAverageSubscribers.append(line + System.lineSeparator());
	}

	private void writeCsvLinePublishers(String line) throws IOException {
		this.writerPublishers.append(line + System.lineSeparator());
	}

	private void writeCsvAverageLinePublishers(String line) throws IOException {
		this.writerAveragePublishers.append(line + System.lineSeparator());
	}

	private void writePacketsLine(String line) throws IOException {
		this.writerPackets.append(line + System.lineSeparator());
	}

	private void closeWriter(BufferedWriter writer) {
		if (writer != null) {
			try {
				writer.close();
			} catch (IOException e) {
				log.error("Error closing CSV writer");
			}
		}
	}

}
