package com.ssafy.ontop.world.map;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.world.dto.WorldMapMetadata;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

/** 생성물 사전 검증 전용. Spring 등록이나 ParkScene 교체를 수행하지 않는다. */
public final class GeneratedParkMapLoader {
    private static final int MAX_MAP_BYTES = 16 * 1024 * 1024;
    private static final int MAX_MANIFEST_BYTES = 1024 * 1024;
    private static final String MAP_ARTIFACT_PATH = "generated/park/server-map.json";
    private final String expectedMapId;
    private final String artifactPath;
    public GeneratedParkMapLoader() { this("park", MAP_ARTIFACT_PATH); }
    private GeneratedParkMapLoader(String mapId, String artifactPath) { this.expectedMapId=mapId; this.artifactPath=artifactPath; }
    public static GeneratedParkMapLoader renewal() { return new GeneratedParkMapLoader("park-renewal-local", "generated/park-renewal/server-map.local.json"); }

    private final ObjectMapper mapper = new ObjectMapper()
            .enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION)
            .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS);

    public ValidatedMap load(Path mapFile, Path manifestFile) throws IOException {
        byte[] mapBytes = readBounded(mapFile, MAX_MAP_BYTES);
        byte[] manifestBytes = readBounded(manifestFile, MAX_MANIFEST_BYTES);
        return load(mapBytes, manifestBytes);
    }

    public ValidatedMap load(byte[] mapBytes, byte[] manifestBytes) throws IOException {
        require(mapBytes != null && mapBytes.length > 0 && mapBytes.length <= MAX_MAP_BYTES,
                "맵 파일은 1바이트 이상 16MiB 이하여야 합니다.");
        require(manifestBytes != null && manifestBytes.length > 0 && manifestBytes.length <= MAX_MANIFEST_BYTES,
                "manifest는 1바이트 이상 1MiB 이하여야 합니다.");
        JsonNode manifest = mapper.readTree(manifestBytes);
        require(manifest != null && manifest.isObject(), "manifest는 JSON 객체여야 합니다.");
        requireText(manifest, "format", "ontop.park-map-manifest");
        requireText(manifest, "hashAlgorithm", "sha256");
        WorldMapMetadata manifestMetadata = metadata(manifest);
        JsonNode artifact = mapArtifact(manifest);
        JsonNode bytes = artifact.path("bytes");
        require(bytes.isIntegralNumber() && bytes.canConvertToLong() && bytes.longValue() == mapBytes.length,
                "맵 파일 바이트 수가 manifest와 다릅니다.");
        String sha256 = sha256(mapBytes);
        requireText(artifact, "sha256", sha256);

        // 체크섬은 줄바꿈을 포함한 원본 바이트로 계산한다. mapVersion은 별도의 소스 식별값이다.
        JsonNode document = mapper.readTree(mapBytes);
        require(document != null && document.isObject(), "맵은 JSON 객체여야 합니다.");
        requireText(document, "format", "ontop.park-map");
        WorldMapMetadata mapMetadata = metadata(document);
        require(mapMetadata.equals(manifestMetadata), "맵과 manifest의 식별 정보가 다릅니다.");
        validatePhysics(document.path("data").path("physics"));
        return new ValidatedMap(mapMetadata, sha256, mapBytes.length, document);
    }

    private static byte[] readBounded(Path file, int limit) throws IOException {
        try (InputStream input = Files.newInputStream(file)) {
            byte[] bytes = input.readNBytes(limit + 1);
            require(bytes.length <= limit, "생성 파일의 허용 크기를 초과했습니다.");
            return bytes;
        }
    }

    private WorldMapMetadata metadata(JsonNode node) {
        requireText(node, "mapId", expectedMapId);
        JsonNode schema = node.path("schemaVersion");
        require(schema.isIntegralNumber() && schema.canConvertToInt() && schema.intValue() == 2,
                "지원하는 생성 맵 schemaVersion은 2입니다.");
        JsonNode version = node.path("mapVersion");
        require(version.isTextual(), "mapVersion은 문자열이어야 합니다.");
        return new WorldMapMetadata(expectedMapId, 2, version.textValue());
    }

    private JsonNode mapArtifact(JsonNode manifest) {
        JsonNode artifacts = manifest.path("artifacts");
        require(artifacts.isArray(), "manifest.artifacts는 배열이어야 합니다.");
        JsonNode found = null;
        for (JsonNode artifact : artifacts) {
            if (artifactPath.equals(artifact.path("path").textValue())) {
                require(found == null, "manifest의 맵 항목이 중복되었습니다.");
                found = artifact;
            }
        }
        require(found != null, "manifest의 맵 항목이 없습니다.");
        // manifest 경로로 파일을 열지 않는다. 명시적으로 전달받은 두 파일만 읽는다.
        return found;
    }

    private static void validatePhysics(JsonNode physics) {
        require(physics.isObject(), "data.physics 객체가 필요합니다.");
        requireText(physics, "units", "m");
        requireText(physics, "upAxis", "Y");
        requireText(physics, "coordinateSpace", "world");
        requireZero(physics.path("playerInflation"));
        requireZero(physics.path("collisionMargin"));
        JsonNode spawn = physics.path("spawn");
        requireText(spawn, "origin", "capsule-center");
        vector(spawn.path("position"), 3);
        finite(spawn.path("yaw"));
        JsonNode character = physics.path("character");
        positive(character.path("radius"));
        positive(character.path("halfHeight"));
        positive(character.path("offset"));
        for (JsonNode box : array(physics, "boxes")) {
            objectId(box);
            vector(box.path("center"), 3);
            vector(box.path("half"), 3);
            for (JsonNode half : box.path("half")) {
                positive(half);
            }
            finite(box.path("yaw"));
        }
        for (JsonNode hull : array(physics, "hulls")) {
            objectId(hull);
            vertices(hull.path("vertices"), 4);
        }
        for (JsonNode mesh : array(physics, "meshes")) {
            objectId(mesh);
            int vertexCount = vertices(mesh.path("vertices"), 3);
            JsonNode indices = array(mesh, "indices");
            require(!indices.isEmpty() && indices.size() % 3 == 0, "메시 인덱스는 삼각형 배열이어야 합니다.");
            for (JsonNode index : indices) {
                require(index.isIntegralNumber() && index.canConvertToInt()
                                && index.intValue() >= 0 && index.intValue() < vertexCount,
                        "메시 인덱스가 정점 범위를 벗어났습니다.");
            }
        }
    }

    private static void objectId(JsonNode object) {
        require(object.path("id").isTextual() && !object.path("id").textValue().isBlank(),
                "물리 객체 id가 필요합니다.");
        String role = object.path("role").textValue();
        require("solid".equals(role) || "surface".equals(role) || "terrain".equals(role),
                "물리 객체 role이 올바르지 않습니다.");
    }

    private static int vertices(JsonNode values, int minimum) {
        require(values.isArray() && values.size() >= minimum * 3 && values.size() % 3 == 0,
                "정점은 XYZ 순서의 평탄 배열이어야 합니다.");
        for (JsonNode value : values) {
            finite(value);
        }
        return values.size() / 3;
    }

    private static void vector(JsonNode value, int size) {
        require(value.isArray() && value.size() == size, "좌표 배열의 길이가 올바르지 않습니다.");
        for (JsonNode component : value) {
            finite(component);
        }
    }

    private static JsonNode array(JsonNode object, String name) {
        JsonNode value = object.path(name);
        require(value.isArray(), name + " 배열이 필요합니다.");
        return value;
    }

    private static double finite(JsonNode value) {
        require(value.isNumber() && Double.isFinite(value.doubleValue()), "유한한 숫자가 필요합니다.");
        return value.doubleValue();
    }

    private static void positive(JsonNode value) {
        require(finite(value) > 0, "양수인 물리 치수가 필요합니다.");
    }

    private static void requireZero(JsonNode value) {
        require(finite(value) == 0, "생성물에 충돌 여백이나 캐릭터 반경을 미리 적용할 수 없습니다.");
    }

    private static void requireText(JsonNode node, String name, String expected) {
        require(node.path(name).isTextual() && expected.equals(node.path(name).textValue()),
                name + " 값이 올바르지 않습니다.");
    }

    private static String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256을 사용할 수 없습니다.", exception);
        }
    }

    private static void require(boolean condition, String message) {
        if (!condition) {
            throw new IllegalArgumentException(message);
        }
    }

    public record ValidatedMap(WorldMapMetadata metadata, String fileSha256, long bytes, JsonNode document) {
        public ValidatedMap {
            document = document.deepCopy();
        }

        @Override
        public JsonNode document() {
            return document.deepCopy();
        }
    }
}
