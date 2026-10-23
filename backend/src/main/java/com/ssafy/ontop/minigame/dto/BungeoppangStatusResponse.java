package com.ssafy.ontop.minigame.dto;

import java.util.List;

public record BungeoppangStatusResponse(long todayEarned, int dailyCap, boolean isFirstGame,
        List<String> seenTips, String rulesVersion) { }
