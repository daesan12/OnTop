package com.ssafy.ontop.ai;

/** A fixed physical resident per difficulty; speech never invents engine facts. */
public enum OmokResident {
    CHILD("강잼민","EASY","omok-child-","강잼민. 활발한 동네 초딩. 반말이지만 예의 바르고 짧게 말한다."),
    NEIGHBOR("윤한수","NORMAL","omok-neighbor-","윤한수. 편안하고 친절한 동네 주민. 자연스러운 존댓말을 쓴다."),
    ELDER("박영감","HARD","omok-","차분한 오목 고수 박영감. 허허, 구먼, 하게 같은 구어체를 쓴다.");
    public final String name,difficulty,prefix,prompt;
    OmokResident(String name,String difficulty,String prefix,String prompt){this.name=name;this.difficulty=difficulty;this.prefix=prefix;this.prompt=prompt;}
    public String id(String channel){return prefix+channel;}
    public static OmokResident forDifficulty(LocalCompanions.Difficulty d){return switch(d){case EASY->CHILD;case NORMAL->NEIGHBOR;case HARD->ELDER;};}
    private String pick(long variant,String... lines){return lines[Math.floorMod(variant,lines.length)];}
    public String opening(long v){return switch(this){
        case CHILD->pick(v,"나랑 한 판 둘래? 재밌게 해보자!","내가 백돌이지? 오늘은 꼭 이겨 볼 거야!","동네 오목 시간! 먼저 둬도 돼.");
        case NEIGHBOR->pick(v,"반갑습니다. 부담 없이 한 판 즐겨볼까요?","잠깐 산책하다 왔어요. 흑돌부터 두시면 돼요.","좋아요, 천천히 생각하며 둬봐요.");
        case ELDER->pick(v,"허허, 한 판 두어 보세. 먼저 두게나.","오목 친구가 생겼구먼. 차분히 시작해 보세.","좋은 승부를 기다렸네. 첫 수는 자네 몫일세.");};}
    public String response(long v,OmokAnalyzer.Analysis a){return switch(this){
        case CHILD->pick(v,"음… 나는 여기 둘래!","이번 수는 꽤 고민했어. 네 차례야!","앗, 그렇게 뒀구나! 나도 잘 생각해 볼게.");
        case NEIGHBOR->pick(v,"저는 이렇게 이어볼게요.","한 수씩 모양을 만들어가는 재미가 있네요.","서두르지 마세요. 다음 수를 기다릴게요.")+" 착수 전 평가로는 "+observation(v,a);
        case ELDER->pick(v,"나는 이 자리에 놓겠네.","돌 하나에도 뜻이 있는 법이지.","다음 수를 천천히 살펴보게나.")+" 직전 국면은 "+observation(v,a);};}
    public String observation(long v,OmokAnalyzer.Analysis a){String side=switch(a.advantage()){case "BLACK"->"흑";case "WHITE"->"백";default->"";};
        if(!side.isEmpty())return switch(this){
            case CHILD->pick(v,side+" 쪽이 좀 편해 보이는데?",side+" 돌 모양을 한번 봐!", "지금은 "+side+" 쪽 흐름이 좋아 보인다!");
            case NEIGHBOR->pick(v,"지금은 "+side+" 쪽이 조금 편해 보이네요.",side+" 쪽 흐름이 좋아 보여요. 다음 수가 궁금하네요.","엔진으로 본 지금 국면은 "+side+" 쪽에 조금 기울었네요.");
            case ELDER->pick(v,"흠, "+side+"을 든 친구가 조금 편하구먼.","허허, 지금 흐름은 "+side+" 쪽이네. 방심은 금물일세.",side+"의 돌 모양이 괜찮구먼. 끝까지 살펴보세.");};
        if(a.advantage().equals("BALANCED"))return switch(this){
            case CHILD->pick(v,"아직 누가 이길지 모르겠어!","오, 둘 다 만만치 않은데?","팽팽해! 다음 수가 궁금하다.");
            case NEIGHBOR->pick(v,"아직은 팽팽한 국면이네요.","양쪽 모두 기회가 있어 보여요.","쉽게 기울지 않는 판이네요. 천천히 지켜봐요.");
            case ELDER->pick(v,"아직 팽팽하구먼. 서두르지 말게.","양쪽 모두 버틸 만하네. 재미있는 판일세.","어느 쪽도 방심할 때가 아니구먼.");};
        return switch(this){
            case CHILD->pick(v,"아직은 누가 좋은지 잘 모르겠어. 더 볼래!","잠깐, 돌 모양부터 살펴볼게.","오목 구경도 재밌네. 둘 다 힘내!");
            case NEIGHBOR->pick(v,"아직 판세를 단정하기 어렵네요.","확인된 평가가 없어 조금 더 지켜볼게요.","어느 쪽이 유리한지 아직은 말하기 어렵네요.");
            case ELDER->pick(v,"아직은 판세를 단정하기 어렵구먼.","돌이 더 놓여야 알겠네. 천천히 지켜보세.","확실치 않은 판세를 함부로 말할 수는 없지.");};}
    public String policy(){return switch(this){case CHILD->"무르기랑 무승부 제안은 안 받을래. 끝까지 해보자!";case NEIGHBOR->"무르기와 무승부 제안은 받지 않아요. 기권하거나 끝까지 두어주세요.";case ELDER->"무르기와 무승부 제안은 받지 않네. 끝까지 두거나 대결을 마쳐 주게.";};}
    public String goodbye(){return switch(this){case CHILD->"다음에 또 같이 두자! 엽전은 안 바뀌어.";case NEIGHBOR->"즐거웠어요. 다음에 또 만나요. 엽전 변동은 없어요.";case ELDER->"다음에 다시 두어 보세. 엽전 변동은 없네.";};}
    public String timeout(){return switch(this){case CHILD->"앗, 생각 시간이 다 됐어! 다음에 또 두자.";case NEIGHBOR->"제한 시간이 지나 이번 판은 끝났어요. 다음에 다시 둬요.";case ELDER->"제한 시간이 지나 이번 판은 끝났네. 다음에 다시 두어 보세.";};}
    public String result(boolean humanWon,boolean draw){return switch(this){
        case CHILD->draw?"우와, 비겼다! 끝까지 재밌었어.":humanWon?"와, 잘 둔다! 다음엔 내가 도전할게.":"야호, 내가 이겼다! 다음에 또 하자.";
        case NEIGHBOR->draw?"끝까지 팽팽했네요. 좋은 승부였어요.":humanWon?"멋지게 두셨네요. 한 수 배웠어요.":"이번엔 제가 이겼네요. 즐거운 승부였어요.";
        case ELDER->draw?"끝까지 팽팽했구먼. 좋은 무승부일세.":humanWon?"허허, 잘 두는구먼. 좋은 승부였네.":"이번에는 내 쪽으로 흘렀구먼. 다음에 또 두세.";};}
}
