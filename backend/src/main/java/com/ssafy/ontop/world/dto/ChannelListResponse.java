package com.ssafy.ontop.world.dto;

import java.util.List;

public record ChannelListResponse(List<ChannelResponse> items) {

    public ChannelListResponse {
        items = List.copyOf(items);
    }

    public record ChannelResponse(String channelId, String name, int currentUsers, int capacity, boolean joinable) {
    }
}
