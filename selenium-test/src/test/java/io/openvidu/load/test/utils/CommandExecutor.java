package io.openvidu.load.test.utils;

import static java.lang.invoke.MethodHandles.lookup;
import static org.slf4j.LoggerFactory.getLogger;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;

import org.slf4j.Logger;

public class CommandExecutor {
	
	final static Logger log = getLogger(lookup().lookupClass());

	public static String executeCommand(String bashCommand) {
		String result = "";
		try {
			Process p = Runtime.getRuntime().exec(bashCommand);
			BufferedReader in = new BufferedReader(new InputStreamReader(p.getInputStream()));
			String inputLine;
			while ((inputLine = in.readLine()) != null) {
				result += inputLine;
			}
			in.close();
		} catch (IOException e) {
			log.error(e.toString());
		}
		return result;
	}

}
