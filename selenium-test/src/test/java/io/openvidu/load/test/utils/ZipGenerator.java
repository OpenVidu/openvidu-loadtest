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
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.slf4j.Logger;

import io.openvidu.load.test.OpenViduLoadTest;

public class ZipGenerator {

	final static Logger log = getLogger(lookup().lookupClass());

	private String folderToZip;

	public void zipFiles() throws IOException {
		this.folderToZip = new File(OpenViduLoadTest.RESULTS_PATH).getName();

		log.info("Compressing result files into {}.zip", folderToZip);

		FileOutputStream fos = new FileOutputStream(OpenViduLoadTest.RESULTS_PATH + "/" + this.folderToZip + ".zip");
		ZipOutputStream zipOut = new ZipOutputStream(fos);
		File fileToZip = new File(OpenViduLoadTest.RESULTS_PATH);
		zipFile(fileToZip, fileToZip.getName(), zipOut);
		zipOut.close();
		fos.close();

		log.info("Zip file successfully created. Available at {}",
				OpenViduLoadTest.RESULTS_PATH + "/" + this.folderToZip + ".zip");
	}

	private void zipFile(File fileToZip, String fileName, ZipOutputStream zipOut) throws IOException {

		log.info("Zipping {}", fileName);

		if ((this.folderToZip + ".zip").equals(fileToZip.getName())) {
			return;
		}
		if (fileToZip.isDirectory()) {
			log.info("File {} is a directory. Recursive zip", fileName);
			if (fileName.endsWith("/")) {
				zipOut.putNextEntry(new ZipEntry(fileName));
				zipOut.closeEntry();
			} else {
				zipOut.putNextEntry(new ZipEntry(fileName + "/"));
				zipOut.closeEntry();
			}
			File[] children = fileToZip.listFiles();
			for (File childFile : children) {
				zipFile(childFile, fileName + "/" + childFile.getName(), zipOut);
			}
			return;
		}
		FileInputStream fis = new FileInputStream(fileToZip);
		ZipEntry zipEntry = new ZipEntry(fileName);
		zipOut.putNextEntry(zipEntry);
		byte[] bytes = new byte[1024];
		int length;
		while ((length = fis.read(bytes)) >= 0) {
			zipOut.write(bytes, 0, length);
		}
		fis.close();
	}

}