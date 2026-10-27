package com.ssafy.ontop.minigame.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.StreamReadFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.ssafy.ontop.minigame.dto.BungeoppangV4DeliveryDtos;
import java.nio.charset.StandardCharsets;
import java.io.IOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Set;

/** Strict parser and canonical hashes for the Bungeoppang v4 delivery wire contract. */
public final class BungeoppangV4DeliveryContract {
    public static final int MAX_BODY_BYTES = 256 * 1024;
    private static final Set<String> ROOT_FIELDS = Set.of("rulesVersion", "throughSeq", "prefixHash", "log");
    private static final Set<String> COMMON_FIELDS = Set.of("seq", "action", "t");
    private static final ObjectMapper JSON = JsonMapper.builder()
            .enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION).build();

    private BungeoppangV4DeliveryContract() {
    }

    public static BungeoppangV4DeliveryDtos.Request parse(byte[] body) {
        try { return parse(JSON.readTree(body)); }
        catch (IOException exception) { throw invalid(); }
    }

    public static BungeoppangV4DeliveryDtos.Request parse(JsonNode body) {
        if (body == null || !body.isObject() || body.size() != ROOT_FIELDS.size()
                || !only(body, ROOT_FIELDS) || !body.path("rulesVersion").isTextual()
                || !body.path("throughSeq").isIntegralNumber() || !body.path("throughSeq").canConvertToInt()
                || !body.path("prefixHash").isTextual() || !body.path("log").isArray()) {
            throw invalid();
        }
        String version = body.path("rulesVersion").textValue();
        int throughSeq = body.path("throughSeq").intValue();
        String prefixHash = body.path("prefixHash").textValue();
        if (!BungeoppangV4Spec.RULES_VERSION.equals(version) || throughSeq < 1
                || !prefixHash.matches("[0-9a-f]{64}") || body.path("log").size() != throughSeq
                || throughSeq > BungeoppangV4Spec.rules().maxLogEntries()) {
            throw invalid();
        }
        List<BungeoppangV4DeliveryDtos.Action> actions = new ArrayList<>(throughSeq);
        for (int i = 0; i < throughSeq; i++) {
            actions.add(parseAction(body.path("log").get(i), i));
        }
        return new BungeoppangV4DeliveryDtos.Request(version, throughSeq, prefixHash, List.copyOf(actions));
    }

    public static List<BungeoppangV4Rules.Action> domainActions(BungeoppangV4DeliveryDtos.Request request) {
        return request.log().stream().map(action -> new BungeoppangV4Rules.Action(action.seq(), action.action(),
                action.t(), action.slot(), filling(action.filling()), action.breadId(), action.orderId(),
                action.deliveryKey())).toList();
    }

    public static String prefixHash(long sessionId, String configVersion,
            List<BungeoppangV4DeliveryDtos.Action> actions) {
        byte[] hash = digest(("BUNGEOPPANG/v4\n" + sessionId + "\n" + configVersion + "\n")
                .getBytes(StandardCharsets.UTF_8));
        for (BungeoppangV4DeliveryDtos.Action action : actions) {
            Object[] tuple = {action.seq(), action.action(), action.t(), action.slot(), action.filling(),
                    action.breadId(), action.orderId(), action.deliveryKey()};
            byte[] encoded;
            try { encoded = JSON.writeValueAsBytes(tuple); }
            catch (JsonProcessingException exception) { throw new IllegalStateException("행동 해시 생성 오류", exception); }
            byte[] input = new byte[hash.length + 1 + encoded.length];
            System.arraycopy(hash, 0, input, 0, hash.length);
            input[hash.length] = 0x0A;
            System.arraycopy(encoded, 0, input, hash.length + 1, encoded.length);
            hash = digest(input);
        }
        return HexFormat.of().formatHex(hash);
    }

    public static String requestHash(long sessionId, BungeoppangV4DeliveryDtos.Request request) {
        List<Object[]> tuples = request.log().stream().map(action -> new Object[]{action.seq(), action.action(),
                action.t(), action.slot(), action.filling(), action.breadId(), action.orderId(),
                action.deliveryKey()}).toList();
        Object[] identity = {"DELIVERY", Long.toString(sessionId), request.rulesVersion(),
                request.throughSeq(), request.prefixHash(), tuples};
        try { return HexFormat.of().formatHex(digest(JSON.writeValueAsBytes(identity))); }
        catch (JsonProcessingException exception) { throw new IllegalStateException("요청 해시 생성 오류", exception); }
    }

    private static BungeoppangV4DeliveryDtos.Action parseAction(JsonNode node, int index) {
        if (node == null || !node.isObject() || !node.path("seq").isIntegralNumber()
                || !node.path("seq").canConvertToInt() || !node.path("action").isTextual()
                || !node.path("t").isIntegralNumber() || !node.path("t").canConvertToInt()) {
            throw invalid(index);
        }
        String action = node.path("action").textValue();
        Set<String> fields = switch (action) {
            case "POUR", "TURN", "DISCARD" -> union(COMMON_FIELDS, Set.of("slot"));
            case "FILL" -> union(COMMON_FIELDS, Set.of("slot", "filling"));
            case "TRAY_DISCARD" -> union(COMMON_FIELDS, Set.of("breadId"));
            case "DELIVER" -> union(COMMON_FIELDS, Set.of("orderId", "deliveryKey"));
            default -> throw invalid(index);
        };
        if (node.size() != fields.size() || !only(node, fields)) { throw invalid(index); }
        Integer slot = integer(node, "slot", index);
        Long breadId = longInteger(node, "breadId", index);
        String filling = text(node, "filling", index);
        String orderId = text(node, "orderId", index);
        String deliveryKey = text(node, "deliveryKey", index);
        if (filling != null && !Set.of("bean", "custard", "pizza", "chocolate").contains(filling)) {
            throw invalid(index);
        }
        if (breadId != null && breadId <= 0 || orderId != null && !orderId.matches("[1-9][0-9]{0,18}")
                || deliveryKey != null && !deliveryKey.matches("[A-Za-z0-9_-]{1,64}")) {
            throw invalid(index);
        }
        return new BungeoppangV4DeliveryDtos.Action(node.path("seq").intValue(), action,
                node.path("t").intValue(), slot, filling, breadId, orderId, deliveryKey);
    }

    private static Integer integer(JsonNode node, String name, int index) {
        if (!node.has(name)) { return null; }
        if (!node.path(name).isIntegralNumber() || !node.path(name).canConvertToInt()) { throw invalid(index); }
        return node.path(name).intValue();
    }

    private static Long longInteger(JsonNode node, String name, int index) {
        if (!node.has(name)) { return null; }
        if (!node.path(name).isIntegralNumber() || !node.path(name).canConvertToLong()) { throw invalid(index); }
        return node.path(name).longValue();
    }

    private static String text(JsonNode node, String name, int index) {
        if (!node.has(name)) { return null; }
        if (!node.path(name).isTextual()) { throw invalid(index); }
        return node.path(name).textValue();
    }

    private static BungeoppangV4Rules.Filling filling(String value) {
        return value == null ? null : switch (value) {
            case "bean" -> BungeoppangV4Rules.Filling.BEAN;
            case "custard" -> BungeoppangV4Rules.Filling.CUSTARD;
            case "pizza" -> BungeoppangV4Rules.Filling.PIZZA;
            case "chocolate" -> BungeoppangV4Rules.Filling.CHOCOLATE;
            default -> throw invalid();
        };
    }

    private static boolean only(JsonNode node, Set<String> allowed) {
        var fields = node.fieldNames();
        while (fields.hasNext()) { if (!allowed.contains(fields.next())) { return false; } }
        return true;
    }

    private static Set<String> union(Set<String> left, Set<String> right) {
        var values = new java.util.HashSet<>(left);
        values.addAll(right);
        return Set.copyOf(values);
    }

    private static byte[] digest(byte[] value) {
        try { return MessageDigest.getInstance("SHA-256").digest(value); }
        catch (NoSuchAlgorithmException exception) { throw new IllegalStateException("SHA-256 오류", exception); }
    }

    private static MinigameException invalid() { return invalid(null); }

    private static MinigameException invalid(Integer index) {
        return new MinigameException(400, "INVALID_REQUEST", "요청 필드와 값을 확인하세요.", null, index);
    }
}
