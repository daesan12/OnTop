package com.ssafy.ontop.announcement.dto;

import java.util.HashSet;
import java.util.List;
import java.util.UUID;

public record AnnouncementOrderRequest(List<Item> items) {
    public record Item(String id, long expectedVersion) { }

    public void validate() {
        if (items == null || items.size() > 10000) { throw new IllegalArgumentException("공지 순서를 확인해주세요."); }
        var ids = new HashSet<String>();
        for (Item item : items) {
            if (item == null || item.id() == null || item.expectedVersion() < 0
                    || !UUID.fromString(item.id()).toString().equals(item.id()) || !ids.add(item.id())) {
                throw new IllegalArgumentException("공지 순서를 확인해주세요.");
            }
        }
    }
}
