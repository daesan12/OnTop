package com.ssafy.ontop.event.asset;

import java.util.List;

public record AssetAwardFinalizeRequest(Integer candidateCount, Integer excludedGmCount,
        List<String> expectedSourceRecordIds) {}
