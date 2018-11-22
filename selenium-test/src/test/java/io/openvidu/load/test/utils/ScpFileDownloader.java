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

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Properties;
import java.util.concurrent.atomic.AtomicBoolean;

import org.slf4j.Logger;

import com.jcraft.jsch.Channel;
import com.jcraft.jsch.ChannelExec;
import com.jcraft.jsch.JSch;
import com.jcraft.jsch.JSchException;
import com.jcraft.jsch.Session;

import io.openvidu.load.test.OpenViduLoadTest;

/**
 * Downloads remote files through SCP protocol
 *
 * @author Pablo Fuente (pablofuenteperez@gmail.com)
 */
public class ScpFileDownloader {

	final static Logger log = getLogger(lookup().lookupClass());

	Session jschSession;
	File f;
	FileOutputStream fos;
	String remoteFileName;
	Thread downloadProgressThread;
	AtomicBoolean keepProgressThread = new AtomicBoolean(true);

	public ScpFileDownloader(String username, String hostname) {
		JSch jsch = new JSch();
		Properties config = new Properties();
		config.put("StrictHostKeyChecking", "no");
		config.put("PreferredAuthentications", "publickey");
		try {
			jsch.addIdentity(OpenViduLoadTest.PRIVATE_KEY_PATH);
			jschSession = jsch.getSession(username, hostname, 22);
			jschSession.setConfig(config);
			jschSession.connect();
		} catch (JSchException e) {
			log.error("Couldn't connect to {} to download file", hostname);
		}
	}

	public void downloadFile(String remotePath, String filename, String localPath) {
		try {

			log.info("Downloading file {} from {}", remotePath + "/" + filename, jschSession.getHost());

			// Exec 'scp -f FILE_PATH'
			String command = "scp -f " + remotePath + "/" + filename;
			Channel channel = jschSession.openChannel("exec");
			((ChannelExec) channel).setCommand(command);

			// Get I/O streams for remote scp
			OutputStream out = channel.getOutputStream();
			InputStream in = channel.getInputStream();

			channel.connect();

			byte[] buf = new byte[1024];

			// Send '\0'
			buf[0] = 0;
			out.write(buf, 0, 1);
			out.flush();

			while (true) {
				int c = checkAck(in);
				if (c != 'C') {
					break;
				}

				// Read '0644 '
				in.read(buf, 0, 5);

				long filesize = 0L;
				while (true) {
					if (in.read(buf, 0, 1) < 0) {
						// Error
						break;
					}
					if (buf[0] == ' ')
						break;
					filesize = filesize * 10L + (long) (buf[0] - '0');
				}

				String file = null;
				for (int i = 0;; i++) {
					in.read(buf, i, 1);
					if (buf[i] == (byte) 0x0a) {
						file = new String(buf, 0, i);
						break;
					}
				}

				remoteFileName = file;
				final long fileSizeAux = filesize;

				log.info("File: {}. Size: {} KB", remoteFileName, (int) (filesize / (1024)));

				// Send '\0'
				buf[0] = 0;
				out.write(buf, 0, 1);
				out.flush();

				String filePath = localPath + "/" + remoteFileName;
				f = new File(filePath);

				if (fileSizeAux > 0) {
					downloadProgressThread = new Thread(() -> {
						while (keepProgressThread.get()) {
							downloadProgress(f, fileSizeAux);
						}
					});
					downloadProgressThread.start();
				}

				// Read a content of lfile
				this.fos = new FileOutputStream(f);
				int foo;
				while (true) {
					if (buf.length < filesize)
						foo = buf.length;
					else
						foo = (int) filesize;
					foo = in.read(buf, 0, foo);
					if (foo < 0) {
						// error
						break;
					}
					fos.write(buf, 0, foo);
					filesize -= foo;
					if (filesize == 0L)
						break;
				}
				fos.close();
				fos = null;

				if (checkAck(in) != 0) {
					System.exit(0);
				}

				// send '\0'
				buf[0] = 0;
				out.write(buf, 0, 1);
				out.flush();
			}
			
			if (downloadProgressThread != null) {
				downloadProgressThread.interrupt();
				keepProgressThread.set(false);
			}
			jschSession.disconnect();
			printProgress(f, null);

			log.info("File {} downloaded successfully. Available at {}", filename, f.getAbsolutePath());

		} catch (Exception e) {
			if (e != null) {
				log.error(e.toString());
			}
			if (fos != null) {
				try {
					fos.close();
				} catch (Exception ee) {
					log.error("Error closing FileOutputStream after file download ({})", f.getAbsolutePath());
				}
			}
		}
	}

	private static int checkAck(InputStream in) throws IOException {
		int b = in.read();
		// b may be 0 for success,
		// 1 for error,
		// 2 for fatal error,
		// -1
		if (b == 0)
			return b;
		if (b == -1)
			return b;

		if (b == 1 || b == 2) {
			StringBuffer sb = new StringBuffer();
			int c;
			do {
				c = in.read();
				sb.append((char) c);
			} while (c != '\n');
			if (b == 1) { // Error
				log.error(sb.toString());
			}
			if (b == 2) { // Fatal error
				log.error(sb.toString());
			}
		}
		return b;
	}

	private void downloadProgress(File f, Long finalSize) {
		printProgress(f, finalSize);
		try {
			Thread.sleep(2000);
		} catch (InterruptedException e) {
		}
	}

	private void printProgress(File f, Long finalSize) {
		int progress = finalSize == null ? 100 : (int) ((f.length() * 100) / finalSize);
		log.info("{}% [{}]", progress, remoteFileName);
	}

}
