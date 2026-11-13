package com.ssafy.ontop.ai;

import com.ssafy.ontop.game.omok.domain.OmokBoard;
import java.util.*;

/** Legal tactical fallback; never pretends to have an engine win probability. */
public final class OmokNpcMoves {
    private OmokNpcMoves() { }
    public static int[] choose(OmokBoard.Snapshot board,List<OmokBoard.Move> history,String recommendation,String difficulty) {
        boolean black=history.size()%2==0;
        var legal=new ArrayList<int[]>();
        for(int y=0;y<15;y++) for(int x=0;x<15;x++) {
            final int px=x,py=y;
            if(board.board().get(y).get(x)==0 && (!black || board.forbiddenMoves().stream().noneMatch(p -> p.x()==px && p.y()==py))) legal.add(new int[]{x,y});
        }
        if(legal.isEmpty()) throw new IllegalArgumentException("착수 가능한 칸이 없습니다.");
        for(var p:legal) if(wins(board,history,black,p)) return p;
        for(var p:legal) if(wins(board,history,!black,p)) return p;
        if(!"EASY".equals(difficulty) && recommendation!=null && recommendation.matches("\\d{1,2},\\d{1,2}")) {
            var c=recommendation.split(","); int x=Integer.parseInt(c[0]),y=Integer.parseInt(c[1]);
            for(var p:legal) if(p[0]==x && p[1]==y) return p;
        }
        legal.sort(Comparator.<int[]>comparingDouble(p -> score(board,p,black)).reversed());
        return legal.get("EASY".equals(difficulty)?Math.min(2,legal.size()-1):0);
    }
    private static boolean wins(OmokBoard.Snapshot snapshot,List<OmokBoard.Move> history,boolean black,int[] p) {
        boolean line=false;int stone=black?1:2;
        for(int[] d:new int[][]{{1,0},{0,1},{1,1},{1,-1}}) {
            int count=1;
            for(int sign:new int[]{-1,1}) for(int i=1;i<15;i++) {
                int x=p[0]+d[0]*i*sign,y=p[1]+d[1]*i*sign;
                if(x<0||x>=15||y<0||y>=15||snapshot.board().get(y).get(x)!=stone) break;
                count++;
            }
            if(black?count==5:count>=5)line=true;
        }
        if(!line)return false;
        var b=new OmokBoard();
        try { for(var m:history) b.place(m.stone(),m.x(),m.y()); b.place(black?OmokBoard.Stone.BLACK:OmokBoard.Stone.WHITE,p[0],p[1]);
            return b.snapshot().outcome()==(black?OmokBoard.Outcome.BLACK_WIN:OmokBoard.Outcome.WHITE_WIN);
        } catch(IllegalArgumentException illegal) { return false; }
    }
    private static double score(OmokBoard.Snapshot b,int[] p,boolean black) {
        double score=14-Math.abs(p[0]-7)-Math.abs(p[1]-7); int own=black?1:2;
        for(int[] d:new int[][]{{1,0},{0,1},{1,1},{1,-1}}) for(int stone=1;stone<=2;stone++) {
            int connected=0;
            for(int sign:new int[]{-1,1}) for(int i=1;i<=4;i++) {
                int x=p[0]+sign*d[0]*i,y=p[1]+sign*d[1]*i;
                if(x<0||x>=15||y<0||y>=15||b.board().get(y).get(x)!=stone) break;
                connected++;
            }
            score+=Math.pow(8,connected)*(stone==own?1.2:1);
        }
        return score;
    }
}
