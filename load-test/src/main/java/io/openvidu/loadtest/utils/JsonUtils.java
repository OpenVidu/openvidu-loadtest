package io.openvidu.loadtest.utils;

import java.lang.reflect.Type;
import java.util.List;

import org.springframework.stereotype.Service;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.reflect.TypeToken;
import com.google.gson.stream.JsonReader;

@Service
public class JsonUtils {
	
	public JsonObject getJson(String string){
		return new Gson().fromJson(string, JsonObject.class);
	}
	
	public JsonObject getJson(JsonReader reader){
		return new Gson().fromJson(reader, JsonObject.class);
	}
	
	public List<String> getStringList(JsonArray array){
		Type listType = new TypeToken<List<String>>() {
		}.getType();
		return new Gson().fromJson(array, listType);
	}

}
