package io.openvidu.loadtest.services;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class Sleeper {
	private static final Logger log = LoggerFactory.getLogger(Sleeper.class);
    public void sleep(int seconds, String reason) {
		if (seconds > 0) {
			try {
				if (reason != null) {
					log.info("Waiting {} seconds because of {}", seconds, reason);
				}
				Thread.sleep(seconds * 1000);
			} catch (InterruptedException e) {
				e.printStackTrace();
			}
		}

	}
}
