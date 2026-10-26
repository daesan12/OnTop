package com.ssafy.ontop.world.movement;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.jme3.bullet.collision.shapes.BoxCollisionShape;
import com.jme3.bullet.collision.shapes.CollisionShape;
import com.jme3.bullet.collision.shapes.HullCollisionShape;
import com.jme3.bullet.collision.shapes.MeshCollisionShape;
import com.jme3.bullet.collision.shapes.infos.IndexedMesh;
import com.jme3.math.Quaternion;
import com.jme3.math.Vector3f;
import com.jme3.system.NativeLibraryLoader;
import com.jme3.util.BufferUtils;

import java.io.IOException;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;

/** Immutable baked shared-config geometry; no TypeScript/Node runtime in the server. */
public final class ParkScene {
    private static ParkScene instance;
    final JsonNode data;
    final List<Shape> shapes;

    public static synchronized ParkScene load() {
        if (instance == null) {
            try {
                NativeLibraryLoader.setCustomExtractionFolder(
                        Files.createTempDirectory("ontop-physics-").toString());
                NativeLibraryLoader.loadNativeLibrary("bulletjme", true);
                try (var input = ParkScene.class.getResourceAsStream("/world/park.json")) {
                    if (input == null) {
                        throw new IOException("Missing park collision map");
                    }
                    instance = new ParkScene(GeneratedParkMap.enabled()?GeneratedParkMap.current().physicsData():new ObjectMapper().readTree(input));
                }
            } catch (IOException exception) {
                throw new IllegalStateException("공원 충돌 맵을 읽을 수 없습니다.", exception);
            }
        }
        return instance;
    }

    private ParkScene(JsonNode data) {
        this.data = data;
        if (data.path("schemaVersion").asInt() != 1
                || !data.path("units").asText().equals("m")
                || !data.path("upAxis").asText().equals("Y")) {
            throw new IllegalStateException("지원하지 않는 충돌 맵");
        }
        List<Shape> built = new ArrayList<>();
        for (JsonNode box : data.path("boxes")) {
            built.add(
                    new Shape(
                            new BoxCollisionShape(vector(box.path("half"))),
                            vector(box.path("center")),
                            new Quaternion()
                                    .fromAngleAxis(
                                            (float) box.path("yaw").asDouble(), Vector3f.UNIT_Y)));
        }
        for (JsonNode mesh : data.path("meshes")) {
            float[] vertices = floats(mesh.path("vertices"));
            int[] indices = new int[mesh.path("indices").size()];
            for (int i = 0; i < indices.length; i++) {
                indices[i] = mesh.path("indices").get(i).intValue();
            }
            built.add(
                    new Shape(
                            new MeshCollisionShape(
                                    true,
                                    new IndexedMesh(
                                            BufferUtils.createFloatBuffer(vertices),
                                            BufferUtils.createIntBuffer(indices))),
                            Vector3f.ZERO,
                            Quaternion.IDENTITY));
        }
        for (JsonNode hull : data.path("hulls")) {
            built.add(
                    new Shape(
                            new HullCollisionShape(floats(hull.path("vertices"))),
                            Vector3f.ZERO,
                            Quaternion.IDENTITY));
        }
        built.forEach(s -> s.shape().setMargin(0.02f));
        shapes = List.copyOf(built);
    }

    static Vector3f vector(JsonNode node) {
        return new Vector3f(
                (float) node.get(0).asDouble(),
                (float) node.get(1).asDouble(),
                (float) node.get(2).asDouble());
    }

    private static float[] floats(JsonNode node) {
        float[] result = new float[node.size()];
        for (int i = 0; i < result.length; i++) {
            result[i] = (float) node.get(i).asDouble();
        }
        return result;
    }

    public String version() {
        return data.path("sourceSha256").asText();
    }

    public Vector3f spawn(int slot) {
        // The source scene's 16-player spawn area is safe; avatars do not collide with one another.
        // Reuse that area instead of extending later channel slots through the boundary wall.
        slot = Math.floorMod(slot, 16);
        Vector3f first = vector(data.path("spawn").path("first"));
        float spacing = (float) data.path("spawn").path("spacing").asDouble();
        return first.add((slot % 4) * spacing, 0, (slot / 4) * spacing);
    }

    double groundHeight(double x, double z) {
        JsonNode vertices = data.path("meshes").get(0).path("vertices");
        int side = (int) Math.round(Math.sqrt(vertices.size() / 3.0));
        double half = data.path("world").path("halfSize").asDouble();
        double step = 2 * half / (side - 1);
        double gx = Math.max(0, Math.min(side - 1.000001, (x + half) / step));
        double gz = Math.max(0, Math.min(side - 1.000001, (z + half) / step));
        int ix = (int) gx, iz = (int) gz;
        double u = gx - ix, v = gz - iz;
        int a = (iz * side + ix) * 3 + 1;
        double ay = vertices.get(a).asDouble(), by = vertices.get(a + 3).asDouble();
        double cy = vertices.get(a + side * 3).asDouble(),
                dy = vertices.get(a + side * 3 + 3).asDouble();
        return u + v <= 1
                ? ay + u * (by - ay) + v * (cy - ay)
                : dy + (1 - v) * (by - dy) + (1 - u) * (cy - dy);
    }

    record Shape(CollisionShape shape, Vector3f center, Quaternion rotation) {}
}
