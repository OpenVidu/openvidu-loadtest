package io.openvidu.loadtest.models.testcase.request;

import com.google.gson.JsonObject;

import io.openvidu.loadtest.config.LoadTestConfig;

public class QoeAnalysisBody {

    private int paddingDuration = 1;
    private int fragmentDuration = 5;

    public QoeAnalysisBody(LoadTestConfig config) {
        this.paddingDuration = config.getPaddingDuration();
        this.fragmentDuration = config.getFragmentDuration();
    }

    public JsonObject toJson() {
        JsonObject jsonBody = new JsonObject();
        jsonBody.addProperty("paddingDuration", this.paddingDuration);
        jsonBody.addProperty("fragmentDuration", this.fragmentDuration);
        return jsonBody;
    }

}
