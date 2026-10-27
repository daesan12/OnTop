package com.ssafy.ontop.world.map;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class GeneratedParkMapLoaderTests {
    private static final String VERSION = "a".repeat(64);
    private final ObjectMapper mapper = new ObjectMapper();
    private final GeneratedParkMapLoader loader = new GeneratedParkMapLoader();

    @TempDir
    Path directory;

    @Test
    void 원본_파일_체크섬과_소스_버전을_구분해_검증한다() throws Exception {
        byte[] bytes = map();
        Path file = Files.write(directory.resolve("map.json"), bytes);
        Path manifest = Files.write(directory.resolve("manifest.json"), manifest(bytes));

        var result = loader.load(file, manifest);

        assertThat(result.metadata().schemaVersion()).isEqualTo(2);
        assertThat(result.metadata().mapVersion()).isEqualTo(VERSION);
        assertThat(result.fileSha256()).isNotEqualTo(VERSION).isEqualTo(hash(bytes));
        assertThat(result.bytes()).isEqualTo(bytes.length);
        assertThat(result.document().path("data").path("physics").path("meshes").get(0).path("role").asText())
                .isEqualTo("terrain");
    }

    @Test
    void 반환된_JSON을_변경해도_검증된_결과는_바뀌지_않는다() throws Exception {
        byte[] bytes = map();
        var result = loader.load(bytes, manifest(bytes));

        ((ObjectNode) result.document()).put("mapVersion", "b".repeat(64));

        assertThat(result.document().path("mapVersion").asText()).isEqualTo(VERSION);
    }

    @Test
    void 줄바꿈이_변한_파일은_체크섬이_다르면_거절한다() throws Exception {
        byte[] bytes = map();
        byte[] changed = new String(bytes, StandardCharsets.UTF_8).replace("\n", "\r").getBytes(StandardCharsets.UTF_8);

        assertThatThrownBy(() -> loader.load(changed, manifest(bytes)))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("sha256");
    }

    @Test
    void 바이트_수_불일치를_거절한다() throws Exception {
        byte[] bytes = map();
        ObjectNode manifest = (ObjectNode) mapper.readTree(manifest(bytes));
        ((ObjectNode) manifest.path("artifacts").get(0)).put("bytes", bytes.length + 1);

        assertThatThrownBy(() -> loader.load(bytes, mapper.writeValueAsBytes(manifest)))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("바이트");
    }

    @Test
    void 맵과_manifest_버전이_다르면_거절한다() throws Exception {
        byte[] bytes = map();
        ObjectNode manifest = (ObjectNode) mapper.readTree(manifest(bytes));
        manifest.put("mapVersion", "b".repeat(64));

        assertThatThrownBy(() -> loader.load(bytes, mapper.writeValueAsBytes(manifest)))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("식별");
    }

    @Test
    void 지원하지_않는_규격과_변환된_문자열_버전을_거절한다() throws Exception {
        byte[] bytes = map();
        for (String schema : new String[] {"1", "3", "2.0", "\"2\""}) {
            byte[] changed = new String(bytes, StandardCharsets.UTF_8)
                    .replace("\"schemaVersion\":2", "\"schemaVersion\":" + schema).getBytes(StandardCharsets.UTF_8);

            assertThatThrownBy(() -> loader.load(changed, manifest(changed)))
                    .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("schemaVersion");
        }
    }

    @Test
    void 맵_항목이_없거나_중복되면_거절한다() throws Exception {
        byte[] bytes = map();
        ObjectNode manifest = (ObjectNode) mapper.readTree(manifest(bytes));
        var artifacts = manifest.withArray("artifacts");
        artifacts.add(artifacts.get(0).deepCopy());
        assertThatThrownBy(() -> loader.load(bytes, mapper.writeValueAsBytes(manifest)))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("중복");

        artifacts.removeAll().addObject().put("path", "../../map.json");
        assertThatThrownBy(() -> loader.load(bytes, mapper.writeValueAsBytes(manifest)))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("항목이 없습니다");
    }

    @Test
    void 중복키와_뒤에_붙은_JSON을_거절한다() throws Exception {
        for (String suffix : new String[] {",\"mapId\":\"other\"}", "} {}"}) {
            String original = new String(map(), StandardCharsets.UTF_8).stripTrailing();
            byte[] changed = (original.substring(0, original.length() - 1) + suffix).getBytes(StandardCharsets.UTF_8);

            assertThatThrownBy(() -> loader.load(changed, manifest(changed))).isInstanceOf(IOException.class);
        }
    }

    @Test
    void 잘못된_물리_좌표와_이중_반경_적용을_거절한다() throws Exception {
        for (String change : new String[] {"\"units\":\"cm\"", "\"playerInflation\":0.3",
                "\"position\":[0,1e400,0]", "\"indices\":[0,1,3]"}) {
            String original = new String(map(), StandardCharsets.UTF_8);
            String field = change.substring(0, change.indexOf(':'));
            String pattern = switch (field) {
                case "\"units\"" -> "\"units\":\"m\"";
                case "\"playerInflation\"" -> "\"playerInflation\":0";
                case "\"position\"" -> "\"position\":[0,0.84,82]";
                default -> "\"indices\":[0,1,2]";
            };
            byte[] changed = original.replace(pattern, change).getBytes(StandardCharsets.UTF_8);

            assertThatThrownBy(() -> loader.load(changed, manifest(changed)))
                    .isInstanceOf(IllegalArgumentException.class);
        }
    }

    @Test
    void 없는_파일과_비어있거나_너무_큰_입력을_거절한다() throws Exception {
        assertThatThrownBy(() -> loader.load(directory.resolve("missing"), directory.resolve("manifest")))
                .isInstanceOf(IOException.class);
        assertThatThrownBy(() -> loader.load(new byte[0], new byte[1]))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> loader.load(new byte[16 * 1024 * 1024 + 1], new byte[1]))
                .isInstanceOf(IllegalArgumentException.class);
        Path oversized = directory.resolve("oversized");
        Files.write(oversized, new byte[1024 * 1024 + 1]);
        Path file = Files.write(directory.resolve("map"), map());
        assertThatThrownBy(() -> loader.load(file, oversized)).isInstanceOf(IllegalArgumentException.class);
    }

    private byte[] manifest(byte[] bytes) throws Exception {
        ObjectNode root = mapper.createObjectNode();
        root.put("format", "ontop.park-map-manifest");
        root.put("hashAlgorithm", "sha256");
        root.put("mapId", "park");
        root.put("schemaVersion", 2);
        root.put("mapVersion", VERSION);
        root.putArray("artifacts").addObject().put("path", "generated/park/server-map.json")
                .put("bytes", bytes.length).put("sha256", hash(bytes));
        return mapper.writeValueAsBytes(root);
    }

    private String hash(byte[] bytes) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
    }

    private byte[] map() {
        return ("""
                {"format":"ontop.park-map","mapId":"park","schemaVersion":2,"mapVersion":"%s",
                "data":{"physics":{"units":"m","upAxis":"Y","coordinateSpace":"world",
                "playerInflation":0,"collisionMargin":0,"character":{"radius":0.3,"halfHeight":0.48,"offset":0.02},
                "spawn":{"origin":"capsule-center","position":[0,0.84,82],"yaw":0},
                "boxes":[],"hulls":[],"meshes":[{"id":"ground","role":"terrain",
                "vertices":[0,0,0,1,0,0,0,0,1],"indices":[0,1,2]}]}}}
                """).formatted(VERSION).getBytes(StandardCharsets.UTF_8);
    }
}
