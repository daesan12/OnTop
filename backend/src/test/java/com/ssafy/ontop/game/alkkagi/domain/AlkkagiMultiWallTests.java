package com.ssafy.ontop.game.alkkagi.domain;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Map;
import java.util.Random;
import org.dyn4j.dynamics.Body;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import static org.assertj.core.api.Assertions.*;

class AlkkagiMultiWallTests {
    @Test void 개인별_세개씩_총여섯개를_유지하고_네번째는_소모없이_거절한다() throws Exception {
        var m = match(); long now = 1;
        for (int i=0; i<6; i++) {
            install(m, (i%3-1)*2, i<3 ? 0 : -.5, now);
            pass(m, now+1); now+=1_000;
            if(i==4)java.nio.file.Files.writeString(java.nio.file.Path.of("build/alkkagi-five-walls.json"),new ObjectMapper().writeValueAsString(m.snapshot(now)));
        }
        var saved = m.snapshot(now);
        assertThat(saved.walls()).hasSize(6).allMatch(w -> w.expiresAfterTurn()==null);
        assertThat(saved.wallsUsed()).containsExactly(3,3);
        assertThat(saved.walls().stream().filter(w -> w.owner()==0)).hasSize(3);
        assertThat(saved.walls().stream().filter(w -> w.owner()==1)).hasSize(3);
        m.receiveCard(0,"WALL"); var fourth = request(m, "fourth", List.of(), new AlkkagiMatch.Placement(0,.6,0));
        assertThatThrownBy(() -> m.useItem(0,fourth,saved.serverNow()+1)).hasMessage("WALL_LIMIT");
        assertThat(m.privateView(0).cards()).hasSize(1);
        assertThat(m.snapshot(now).walls()).isEqualTo(saved.walls());
        assertThat(new ObjectMapper().valueToTree(saved).path("walls")).hasSize(6);
        assertThatThrownBy(() -> saved.walls().clear()).isInstanceOf(UnsupportedOperationException.class);
        assertThat(match().snapshot(0).walls()).isEmpty();
    }

    @Test void 회전벽_교차와_겹침은_거절하고_추가설치_실패는_차감하지않는다() {
        var m=match();install(m,0,0,1);pass(m,2);pass(m,1_000);
        m.receiveCard(0,"WALL");
        var crossed=request(m,"cross",List.of(),new AlkkagiMatch.Placement(0,0,Math.PI/2));
        assertThatThrownBy(()->m.useItem(0,crossed,2_000)).hasMessage("ITEM_OVERLAP");
        assertThat(m.snapshot(0).walls()).hasSize(1);assertThat(m.privateView(0).cards()).hasSize(1);
        var a=new AlkkagiMatch.WallView(0,0,0,2,.2,Math.PI/4,null);
        var b=new AlkkagiMatch.WallView(1,0,0,2,.2,-Math.PI/4,null);
        assertThat(AlkkagiWallGeometry.overlaps(a,b)).isTrue();
        assertThat(AlkkagiWallGeometry.overlaps(a,new AlkkagiMatch.WallView(1,0,2,2,.2,Math.PI/4,null))).isFalse();
    }

    @Test void 세번째까지_모든_벽이_실제물리에서_알을_반사한다() {
        for (String piece : List.of("p13","p14","p12")) {
            var m=threeWalls();
            shoot(m,piece,0,-1,.5,10_000);
            boolean bounced=false;
            for(int i=0;i<1_000&&m.snapshot(0).stage().equals("SIMULATING");i++) {
                m.advance(10_001+i*8);
                var p=m.snapshot(0).pieces().stream().filter(x->x.id().equals(piece)).findFirst().orElseThrow();
                bounced|=p.vy()>1;assertThat(p.y()).isGreaterThan(.2);
            }
            assertThat(bounced).as(piece).isTrue();
            assertThat(m.snapshot(0).impacts()).anyMatch(i->i.kind().equals("WALL"));
            assertThat(m.snapshot(0).walls()).hasSize(3);
        }
    }

    @Test void 재배치_교환_확대는_첫벽_이외의_벽도_검사한다() {
        for(String type:List.of("RELOCATE","SWAP","GROW")) {
            var m=threeWalls();m.receiveCard(0,type);
            if(!type.equals("RELOCATE")) {
                var pieces=(Map<?,?>)ReflectionTestUtils.getField(m,"pieces");
                ((Body)ReflectionTestUtils.getField(pieces.get("p14"),"body")).getTransform().setTranslation(2,.35);
            }
            var input=request(m,type,type.equals("SWAP")?List.of("p8","p14"):List.of("p14"),
                    type.equals("RELOCATE")?new AlkkagiMatch.Placement(2,0,0):null);
            assertThatThrownBy(()->m.useItem(0,input,10_000)).hasMessage(type.equals("SWAP")?"ITEM_OVERLAP":"ITEM_OVERLAP_OR_OUTSIDE");
            assertThat(m.privateView(0).cards()).hasSize(1);
        }
    }

    @Test void 후보와_시간초과_획득의_벽제외는_설치자_개인한도를_따른다() {
        var hand=new AlkkagiInventory();
        var rules=new AlkkagiCardRules(List.of(1,1,1,1,1,1,1,1),true,false);
        var awards=new AlkkagiCardAwards(new Random(){@Override public int nextInt(int bound){return 0;}},rules);
        awards.resolve(13,13,3,2,hand,1);
        assertThat(rules.excludeExhaustedWalls()).isTrue();
        assertThat(awards.offer(0).options()).noneMatch(o->o.type()==AlkkagiInventory.Type.WALL);
        assertThat(awards.offer(1).options()).anyMatch(o->o.type()==AlkkagiInventory.Type.WALL);
        awards.expire(10_001,3,2,hand);
        assertThat(hand.cards(0)).noneMatch(c->c.type()==AlkkagiInventory.Type.WALL);
        assertThat(hand.cards(1)).anyMatch(c->c.type()==AlkkagiInventory.Type.WALL);
        awards.resolve(10,10,3,3,hand,20_000);
        for(int actor=0;actor<2;actor++)assertThat(awards.offer(actor).options()).noneMatch(o->o.type()==AlkkagiInventory.Type.WALL);
    }

    private AlkkagiMatch match(){var m=new AlkkagiMatch(AlkkagiSettings.provisional());m.start(0);return m;}
    private AlkkagiMatch threeWalls(){
        var m=match();long now=1;
        for(double x:List.of(0d,2d,-2d)) {
            install(m,x,0,now);pass(m,now+1);pass(m,now+1_000);now+=2_000;
        }
        return m;
    }
    private AlkkagiMatch.ItemUse request(AlkkagiMatch m,String id,List<String> targets,AlkkagiMatch.Placement at){
        var s=m.snapshot(0);return new AlkkagiMatch.ItemUse(s.gameId(),id,s.version(),m.privateView(s.turn()).cards().getFirst().id(),targets,at);
    }
    private void install(AlkkagiMatch m,double x,double y,long now){
        var actor=m.snapshot(0).turn();m.receiveCard(actor,"WALL");
        m.useItem(actor,request(m,"wall-"+now,List.of(),new AlkkagiMatch.Placement(x,y,0)),now);
    }
    private void pass(AlkkagiMatch m,long now){
        shoot(m,m.snapshot(0).turn()==0?"p0":"p16",0,1,.001,now);
        for(int i=0;i<1_000&&m.snapshot(0).stage().equals("SIMULATING");i++)m.advance(now+1+i*8);
        assertThat(m.snapshot(0).stage()).isEqualTo("AIMING");
    }
    private void shoot(AlkkagiMatch m,String piece,double dx,double dy,double power,long now){
        var s=m.snapshot(0);m.shoot(s.turn(),new AlkkagiMatch.Shot(s.gameId(),"shot-"+now,s.version(),piece,dx,dy,power),now);
    }
}
