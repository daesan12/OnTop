package com.ssafy.ontop.world.movement;

import static org.assertj.core.api.Assertions.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.world.map.PreparedParkMap;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

/** Real Rapier samples checked by the real Java/Bullet geometry, not an FPS benchmark. */
@EnabledIfEnvironmentVariable(named="TEST_UNIFIED_MOVEMENT_FRONTEND", matches="true")
class UnifiedMovementFrontendTests {
 @Test void 실제_Rapier의_달리기점프_수영_전망대좌표를_서버가_동일방식으로_승인한다() throws Exception {
  Path directory=Path.of(System.getenv("UNIFIED_MOVEMENT_DIR")).toAbsolutePath();Files.createDirectories(directory);
  var builder=new ProcessBuilder("node","node_modules/vitest/vitest.mjs","run","tests/unit/unifiedMovementRegions.test.ts","--maxWorkers=1")
   .directory(Path.of("../frontend").toFile()).redirectErrorStream(true).redirectOutput(directory.resolve("rapier-generator.log").toFile());
  builder.environment().put("UNIFIED_MOVEMENT_DIR",directory.toString());var process=builder.start();
  try{assertThat(process.waitFor(60,TimeUnit.SECONDS)).isTrue();assertThat(process.exitValue()).as(Files.readString(directory.resolve("rapier-generator.log"))).isZero();}
  finally{if(process.isAlive())process.destroyForcibly();}
  var prepared=PreparedParkMap.load(Path.of("../frontend/generated/park/server-map.json"),Path.of("../frontend/generated/park/manifest.json"),Set.of("channel-1"));
  var scene=prepared.createScene();var mapper=new ObjectMapper();
  for(var trace:mapper.readTree(directory.resolve("rapier-regions.json").toFile())){
   var time=new AtomicLong();try(var world=new WorldPhysics(scene,true,time::get,true)){
    world.add("a");var p=trace.path("initial");world.place("a",p.path("x").asDouble(),p.path("y").asDouble(),p.path("z").asDouble());
    long epoch=world.snapshot("a").motion().epoch(),seq=1;
    world.report("a",new ClientPositionValidator.Candidate(seq,epoch,new ClientPositionValidator.Pose(p.path("x").asDouble(),p.path("y").asDouble(),p.path("z").asDouble()),false,false),0);
    for(var sample:trace.path("samples")){
     time.set(Math.round(sample.path("at").asDouble()*1e9));p=sample.path("pose");
     var result=world.report("a",new ClientPositionValidator.Candidate(++seq,epoch,new ClientPositionValidator.Pose(p.path("x").asDouble(),p.path("y").asDouble(),p.path("z").asDouble()),sample.path("run").asBoolean(),sample.path("jump").asBoolean()),time.get());
     assertThat(result.motion().correctionReason()).as("%s at=%s pose=%s",trace.path("scenario").asText(),sample.path("at"),p).isNull();
     assertThat(result.motion().authority()).isEqualTo("CLIENT_VALIDATED");assertThat(result.motion().epoch()).isEqualTo(epoch);
     assertThat(Math.hypot(result.x()-p.path("x").asDouble(),result.z()-p.path("z").asDouble())).isLessThan(.002);
     world.step(time.get(),Set.of());
    }
   }
  }
 }
}
