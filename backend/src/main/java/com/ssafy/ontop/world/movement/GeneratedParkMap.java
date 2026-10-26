package com.ssafy.ontop.world.movement;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Map;

/** One checked immutable generated resource set, shared by physics, facilities and admission. */
public final class GeneratedParkMap {
    private final JsonNode document;
    private static final class Holder { static final GeneratedParkMap MAP = read(); }
    public static boolean enabled() { return !Boolean.getBoolean("ontop.map.legacyFixture"); }
    public static GeneratedParkMap current() { return Holder.MAP; }
    public GeneratedParkMap(byte[] json, byte[] manifestBytes) {
        try {
            var mapper = new ObjectMapper();
            document = mapper.readTree(json);
            JsonNode manifest = mapper.readTree(manifestBytes);
            if (!document.path("format").asText().equals("ontop.park-map") || document.path("schemaVersion").asInt() != 2
                || !document.path("mapId").asText().equals("park") || !document.path("mapVersion").asText().matches("[a-f0-9]{64}"))
                throw new IllegalStateException("Unsupported generated park identity");
            for (String key : new String[]{"mapId","mapVersion","schemaVersion"})
                if (!document.path(key).equals(manifest.path(key))) throw new IllegalStateException("Park manifest identity mismatch");
            String checksum = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(json));
            boolean checked = false;
            for (JsonNode artifact : manifest.path("artifacts")) if (artifact.path("path").asText().equals("generated/park/server-map.json"))
                checked = checksum.equals(artifact.path("sha256").asText()) && artifact.path("bytes").asLong() == json.length;
            if (!checked) throw new IllegalStateException("Park resource checksum mismatch");
            if (data().path("physics").path("playerInflation").asDouble(-1) != 0
                || !data().path("metadata").path("mapId").asText().equals("park")) throw new IllegalStateException("Invalid park geometry semantics");
        } catch (java.security.NoSuchAlgorithmException | IOException e) { throw new IllegalStateException("Cannot read generated park", e); }
    }
    private static GeneratedParkMap read() {
        try (var json = GeneratedParkMap.class.getResourceAsStream("/world/generated/park/server-map.json");
             var manifest = GeneratedParkMap.class.getResourceAsStream("/world/generated/park/manifest.json")) {
            if (json == null || manifest == null) throw new IOException("Missing generated park resources");
            return new GeneratedParkMap(json.readAllBytes(), manifest.readAllBytes());
        } catch (IOException e) { throw new IllegalStateException("Cannot load generated park", e); }
    }
    public JsonNode data() { return document.path("data"); }
    public String version() { return document.path("mapVersion").asText(); }
    public Map<String,Object> identity() { return Map.of("mapId","park","schemaVersion",2,"mapVersion",version()); }
    public boolean matches(JsonNode value) {
        return value.isObject() && value.path("mapId").asText().equals("park") && value.path("schemaVersion").isIntegralNumber()
            && value.path("schemaVersion").asInt() == 2 && value.path("mapVersion").asText().equals(version());
    }
    /** Adapt data names only; leave the existing Java movement/physics implementation intact. */
    JsonNode physicsData() {
        var mapper = new ObjectMapper();
        ObjectNode p = data().path("physics").deepCopy();
        p.put("schemaVersion",1);p.put("sourceSha256",version());
        p.set("world",mapper.createObjectNode().put("halfSize",data().path("world").path("half").asDouble()).put("boundaryHalfDepth",.3).put("boundaryHeight",2.4));
        JsonNode pos = p.path("spawn").path("position");
        ObjectNode spawn = mapper.createObjectNode();
        spawn.set("first",mapper.createArrayNode().add(pos.get(0).asDouble()-2.025).add(pos.get(1).asDouble()).add(pos.get(2).asDouble()));
        spawn.put("spacing",1.35);p.set("spawn",spawn);
        ObjectNode lake = data().path("surfaces").path("lake").deepCopy();
        lake.put("radiusX",lake.path("rx").asDouble());lake.put("radiusZ",lake.path("rz").asDouble());p.set("lake",lake);
        // Preserve the existing swimming-to-stone climb assist using generated hull bounds.
        var stones=mapper.createArrayNode();
        for(JsonNode hull:p.path("hulls")) if(hull.path("id").asText().contains("-stone-")) {
            var v=hull.path("vertices");double minX=Double.POSITIVE_INFINITY,minZ=minX,maxX=-minX,maxZ=-minX,top=-minX;
            for(int n=0;n<v.size();n+=3) {
                minX=Math.min(minX,v.get(n).asDouble());maxX=Math.max(maxX,v.get(n).asDouble());
                minZ=Math.min(minZ,v.get(n+2).asDouble());maxZ=Math.max(maxZ,v.get(n+2).asDouble());top=Math.max(top,v.get(n+1).asDouble());
            }
            stones.add(mapper.createObjectNode().put("x",(minX+maxX)/2).put("z",(minZ+maxZ)/2).put("width",maxX-minX).put("depth",maxZ-minZ).put("top",top));
        }
        p.set("steppingStones",stones);
        return p;
    }
    public JsonNode table(String anchorId) {
        for (JsonNode t : data().path("tables")) if (t.path("id").asText().equals(anchorId)) return t;
        throw new IllegalArgumentException("Unknown table anchor: " + anchorId);
    }
    public static String serverTableId(String channelId,String anchorId) {
        return "table-"+java.util.UUID.nameUUIDFromBytes((channelId+"\0"+anchorId).getBytes(StandardCharsets.UTF_8));
    }
    public JsonNode serverTable(String channelId,String serverId) {
        for (JsonNode t : data().path("tables")) if (serverTableId(channelId,t.path("id").asText()).equals(serverId)) return t;
        return null;
    }
}
