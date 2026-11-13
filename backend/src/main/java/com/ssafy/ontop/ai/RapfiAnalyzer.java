package com.ssafy.ontop.ai;

import com.ssafy.ontop.game.omok.domain.OmokBoard;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.io.BufferedWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.TimeUnit;

/** Independent process-pipe adapter. Rapfi itself and its weights are installed outside the repository. */
public final class RapfiAnalyzer implements OmokAnalyzer {
    private final Path executable;
    private final int searchMs;
    public RapfiAnalyzer(Path executable,int searchMs) {
        this.executable=executable.toAbsolutePath().normalize();
        if(!Files.isRegularFile(this.executable) || searchMs<50 || searchMs>1000) throw new IllegalArgumentException("Rapfi 실행 파일·분석 시간 설정 오류");
        this.searchMs=searchMs;
    }
    @Override public synchronized Analysis analyze(OmokBoard.Snapshot board,List<OmokBoard.Move> moves) {
        if(board.outcome()!=OmokBoard.Outcome.PLAYING) return OmokAnalyzer.finished(board.outcome());
        boolean blackTurn=moves.size()%2==0;
        Process process=null;
        long start=System.nanoTime();
        try {
            process=new ProcessBuilder(executable.toString()).directory(executable.getParent().toFile()).redirectErrorStream(true).start();
            Process child=process;
            var lines=new ArrayBlockingQueue<String>(2048);
            Thread reader=Thread.ofVirtual().start(() -> {
                try(var input=new BufferedReader(new InputStreamReader(child.getInputStream(),StandardCharsets.UTF_8))) {
                    String line; while((line=input.readLine())!=null) {
                        if(line.length()>8192 || !lines.offer(line)) { child.destroyForcibly(); break; }
                    }
                } catch(java.io.IOException ignored) { /* Deadline and missing result produce an unavailable analysis. */ }
            });
            try(var writer=new BufferedWriter(new OutputStreamWriter(process.getOutputStream(),StandardCharsets.US_ASCII))) {
                writer.write("START 15\nINFO rule 4\nINFO thread_num 1\nINFO hash_size 16384\nINFO timeout_turn "+searchMs
                        +"\nINFO max_depth 16\nINFO show_detail 2\nINFO pondering 0\nBOARD\n");
                for(var move:moves) writer.write(move.x()+","+move.y()+","+((move.stone()==OmokBoard.Stone.BLACK)==blackTurn?1:2)+"\n");
                writer.write("DONE\n"); writer.flush();
                long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);
                Double score=null,completedScore=null; int depth=0,completedDepth=0; String best="";
                while(System.nanoTime()<deadline) {
                    String line=lines.poll(100,TimeUnit.MILLISECONDS);
                    if(line==null) { if(!process.isAlive() && lines.isEmpty()) break; continue; }
                    if(line.startsWith("ERROR")) throw new IllegalArgumentException("Rapfi 규칙·프로토콜 오류");
                    if(line.startsWith("INFO DEPTH ")) depth=Integer.parseInt(line.substring(11).strip());
                    if(line.startsWith("INFO WINRATE ")) {
                        double value=Double.parseDouble(line.substring(13).strip());
                        if(!Double.isFinite(value) || value<0 || value>1) throw new IllegalArgumentException("Rapfi 지표 오류");
                        score=value;
                    }
                    if(line.equals("INFO PV DONE")) { completedScore=score; completedDepth=depth; }
                    if(line.matches("[0-9]{1,2},[0-9]{1,2}")) { best=line; break; }
                }
                if(best.isEmpty()) throw new IllegalStateException("Rapfi 분석 시간 초과 또는 결과 없음");
                String[] point=best.split(","); int x=Integer.parseInt(point[0]),y=Integer.parseInt(point[1]);
                if(x<0 || x>=15 || y<0 || y>=15 || board.board().get(y).get(x)!=0
                        || blackTurn && board.forbiddenMoves().stream().anyMatch(p -> p.x()==x && p.y()==y))
                    throw new IllegalArgumentException("Rapfi 추천 수가 서버 규칙과 다릅니다.");
                if(completedScore==null) {
                    // Rapfi 250615's immediate-win fast path emits only coordinates, without INFO WINRATE.
                    // Verify the move with our authoritative Renju rules instead of inventing a percentage.
                    var verified=new OmokBoard();
                    for(var move:moves) verified.place(move.stone(),move.x(),move.y());
                    verified.place(blackTurn?OmokBoard.Stone.BLACK:OmokBoard.Stone.WHITE,x,y);
                    var outcome=verified.snapshot().outcome();
                    if(outcome==OmokBoard.Outcome.PLAYING) throw new IllegalStateException("Rapfi 평가 지표 누락");
                    return new Analysis("RAPFI_TACTICAL",blackTurn?"BLACK":"WHITE",null,0,
                            TimeUnit.NANOSECONDS.toMillis(System.nanoTime()-start),best,
                            (blackTurn?"흑":"백")+"에게 즉시 승리할 기회가 보이는구먼.");
                }
                double black=blackTurn?completedScore:1-completedScore;
                String advantage=completedDepth<2?"UNKNOWN":black>.65?"BLACK":black<.35?"WHITE":"BALANCED";
                String comment=switch(advantage) {
                    case "BLACK" -> "흠, 지금은 흑을 든 친구가 조금 편해 보이는구먼.";
                    case "WHITE" -> "허허, 백을 든 친구 쪽으로 흐름이 기울고 있네.";
                    case "BALANCED" -> "아직 팽팽하구먼. 어느 쪽도 방심할 때가 아니야.";
                    default -> "아직은 판세를 단정하기 어렵구먼.";
                };
                writer.write("END\n"); writer.flush();
                process.waitFor(500,TimeUnit.MILLISECONDS);
                reader.join(500);
                return new Analysis("RAPFI",advantage,black,completedDepth,TimeUnit.NANOSECONDS.toMillis(System.nanoTime()-start),best,comment);
            }
        } catch(InterruptedException exception) { Thread.currentThread().interrupt(); return OmokAnalyzer.unavailable(); }
        catch(java.io.IOException | RuntimeException exception) { return OmokAnalyzer.unavailable(); }
        finally { if(process!=null && process.isAlive()) process.destroyForcibly(); }
    }
}
