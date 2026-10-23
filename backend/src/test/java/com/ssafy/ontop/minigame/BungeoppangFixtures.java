package com.ssafy.ontop.minigame;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

final class BungeoppangFixtures {
    private static final ObjectMapper JSON = new ObjectMapper();
    private BungeoppangFixtures() { }

    /** 실제 발급된 불 세기로 양면 황금 7개(86점)를 만드는 유효 입력. 판정 대역을 쓰지 않는다. */
    static JsonNode sevenGolden(List<Integer> heats) {
        record Entry(int slot, String action, int t) { }
        var entries = new ArrayList<Entry>();
        for (int i = 0; i < 7; i++) {
            int slot = i % 6;
            int pour = i < 6 ? i * 350 : 22000;
            int fill = pour + 3000;
            int duration = (600000 + heats.get(i) - 1) / heats.get(i);
            entries.add(new Entry(slot, "POUR", pour));
            entries.add(new Entry(slot, "FILL", fill));
            entries.add(new Entry(slot, "TURN", fill + duration));
            entries.add(new Entry(slot, "TURN", fill + 2 * duration));
        }
        entries.sort(Comparator.comparingInt(Entry::t));
        var body = JSON.createObjectNode();
        ArrayNode log = body.putArray("log");
        int last = -50;
        for (var entry : entries) {
            int t = Math.max(entry.t(), last + 50);
            log.addObject().put("slot", entry.slot()).put("action", entry.action()).put("t", t);
            last = t;
        }
        body.putArray("seenTips").add("START").add("GOLD").add("UNKNOWN");
        body.put("clientScore", 999999);
        return body;
    }

    static JsonNode body(String value) {
        try { return JSON.readTree(value); }
        catch (Exception exception) { throw new IllegalArgumentException(exception); }
    }
}
