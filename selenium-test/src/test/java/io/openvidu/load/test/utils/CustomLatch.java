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

import java.util.concurrent.CountDownLatch;

/**
 * Customized CountDownLatch to support external abortion
 *
 * @author Pablo Fuente (pablofuenteperez@gmail.com)
 */
public class CustomLatch {

	public class AbortedException extends Exception {

		private static final long serialVersionUID = 1L;

		public AbortedException(String errorMessage) {
			super(errorMessage);
		}
	}

	private CountDownLatch latch;
	private boolean aborted = false;
	private String errorMessage = "";

	public CustomLatch(int countDown) {
		this.latch = new CountDownLatch(countDown);
	}

	public void await() throws AbortedException {
		try {
			latch.await();
		} catch (InterruptedException e) {
			e.printStackTrace();
			if (aborted) {
				throw new AbortedException(errorMessage);
			}
		}
		if (aborted) {
			throw new AbortedException(errorMessage);
		}
	}

	public void abort(String errorMessage) {
		this.aborted = true;
		this.errorMessage = errorMessage;
		while (latch.getCount() > 0) {
			latch.countDown();
		}
	}

	public void succeed() {
		latch.countDown();
	}

}
