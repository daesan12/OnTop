package com.ssafy.ontop.gacha;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.gacha.GachaDtos.*;
import com.ssafy.ontop.wallet.domain.Wallet;
import com.ssafy.ontop.wallet.domain.WalletTransaction;
import com.ssafy.ontop.wallet.repository.WalletRepository;
import com.ssafy.ontop.wallet.repository.WalletTransactionRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Objects;
import java.util.UUID;
import java.util.function.IntUnaryOperator;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

public class GachaService {
    private final GachaRepository repository;
    private final WalletRepository wallets;
    private final WalletTransactionRepository ledger;
    private final EntityManager entities;
    private final TransactionTemplate transactions;
    private final ObjectMapper json;
    private final Clock clock;
    private final IntUnaryOperator random;
    public GachaService(GachaRepository repository, WalletRepository wallets, WalletTransactionRepository ledger,
            EntityManager entities, PlatformTransactionManager manager, ObjectMapper json, Clock clock, IntUnaryOperator random) {
        this.repository=repository; this.wallets=wallets; this.ledger=ledger; this.entities=entities;
        this.json=json; this.clock=clock; this.random=random;
        transactions=new TransactionTemplate(manager);
        transactions.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
    }
    public State state(long userId) {
        return Objects.requireNonNull(transactions.execute(status->{
            repository.member(userId,false);
            return new State(true,GachaRules.TICKET_PRICE,repository.machine(false),repository.inventory(userId),repository.products(true,false),repository.serverNow());
        }));
    }
    public Result recover(long userId,String key) {
        validateKey(key);
        return Objects.requireNonNull(transactions.execute(status->{
            repository.member(userId,false);
            return read(repository.receipt(userId,key).orElseThrow(()->new GachaException(404,"GACHA_RESULT_NOT_FOUND","확정된 결과가 없습니다.")).json());
        }));
    }
    public Result purchase(long userId,String key) { return execute(userId,key,"BUY","",0); }
    public Result draw(long userId,String key,String roundId) {
        if(roundId==null || !roundId.matches("[1-9][0-9]{0,18}")) throw new GachaException(400,"INVALID_REQUEST","회차를 확인해주세요.");
        return execute(userId,key,"DRAW",roundId,0);
    }
    public Result open(long userId,String key,int grade) {
        GachaRules.checkGrade(grade); return execute(userId,key,"OPEN",Integer.toString(grade),grade);
    }
    private Result execute(long userId,String key,String kind,String target,int requestedGrade) {
        validateKey(key);
        return Objects.requireNonNull(transactions.execute(status->{
            // 회원 공유 잠금은 탈퇴의 배타 잠금을 막되 기존 상점의 FK 공유 잠금과 호환된다.
            // 회원 배타 잠금을 먼저 잡아 상점의 지갑 -> 회원 FK와 교착 순환을 만들지 않는다.
            var member=repository.member(userId,true);
            Wallet wallet=wallets.findForUpdateByUserId(userId).orElseThrow(()->new GachaException(409,"WALLET_NOT_READY","지갑 초기화가 필요합니다."));
            entities.refresh(wallet,LockModeType.PESSIMISTIC_WRITE);
            var previous=repository.receipt(userId,key);
            if(previous.isPresent()) {
                var saved=previous.orElseThrow();
                if(!saved.kind().equals(kind)||!saved.target().equals(target))
                    throw new GachaException(409,"IDEMPOTENCY_CONFLICT","같은 작업 ID의 내용이 다릅니다.");
                return read(saved.json());
            }
            Instant now=clock.instant();
            repository.ensureInventory(userId);
            int grade=0; long paid=0,awarded=0; boolean duplicate=false; Product product=null; String roundId=null;
            if(kind.equals("BUY")) {
                if(wallet.reserved()<0 || wallet.balance()<wallet.reserved()) throw new GachaException(503,"GACHA_UNAVAILABLE","지갑 정보를 확인할 수 없습니다.");
                if(wallet.balance()-wallet.reserved()<GachaRules.TICKET_PRICE)
                    throw new GachaException(409,"INSUFFICIENT_BALANCE","뽑기권 구매에 필요한 사용 가능 엽전이 부족합니다.");
                // 실제 보상 대응표가 미등록된 상태에서 이용료를 받지 않는다.
                var catalog=repository.products(true,true);
                for(int required=1;required<=4;required++) {
                    final int g=required;
                    var eligible=catalog.stream().filter(p->p.grade()==g && compatible(p,member.gender())).toList();
                    if(eligible.isEmpty()) throw new GachaException(503,"GACHA_CATALOG_NOT_READY","캐릭터용 등급별 의상 등록이 완료되지 않았습니다.");
                    eligible.forEach(repository::validateProduct);
                }
                paid=GachaRules.TICKET_PRICE; wallet.debit(paid,now); repository.ticket(userId,1);
            } else if(kind.equals("DRAW")) {
                Machine before=repository.machine(true);
                if(!before.roundId().equals(target)) throw new GachaException(409,"GACHA_ROUND_CHANGED","이번 뽑기가 종료됐어요. 뽑기권은 사용하지 않았어요.");
                // Read after acquiring the machine lock: time spent waiting must not extend the gate.
                now=repository.serverNow();
                if(GachaRules.refilling(before.refillEndsAt(),now))
                    throw new GachaException(409,"GACHA_REFILLING","캡슐을 채우고 있어요. 뽑기권은 사용하지 않았어요.");
                repository.ticket(userId,-1);
                int selected=GachaRules.select(before.prizes().stream().mapToInt(Prize::remaining).toArray(),random);
                grade=selected+1; roundId=before.roundId();
                if(grade==5) awarded=GachaRules.COIN_REWARD; else repository.box(userId,grade,1);
                Machine after=repository.advance(before,selected,now);
                Winner winner=selected==0 ? new Winner(Long.toString(userId),member.nickname(),before.roundId()):null;
                String eventId=UUID.randomUUID().toString();
                repository.event(eventId,write(new Event(eventId,after,winner,now)),now);
            } else {
                grade=requestedGrade;
                var products=repository.products(true,true).stream().filter(p->p.grade()==requestedGrade && compatible(p,member.gender())).toList();
                if(products.isEmpty()) throw new GachaException(409,"GACHA_NO_COMPATIBLE_PRODUCT","현재 캐릭터가 착용 가능한 의상이 없습니다. 상자는 보관됩니다.");
                product=products.get(random.applyAsInt(products.size()));
                repository.validateProduct(product);
                repository.box(userId,grade,-1);
                duplicate=repository.owned(userId).containsAll(product.itemIds());
                if(duplicate) awarded=GachaRules.value(grade)/2; else repository.grant(userId,product);
            }
            if(awarded>0) wallet.creditReward(awarded);
            if(paid!=0||awarded!=0) ledger.saveAndFlush(WalletTransaction.gacha(wallet.id(),awarded-paid,ledgerKey(userId,key),now));
            entities.flush(); // JDBC 재고 응답과 JPA 지갑을 같은 커밋 기준으로 맞춘다.
            Result result=new Result(key,kind,roundId,grade,product,duplicate,paid,awarded,repository.inventory(userId),now);
            repository.receipt(userId,key,kind,target,write(result),now);
            return result;
        }));
    }
    private boolean compatible(Product product,String gender) { return product.compatibility().equals("ANY")||product.compatibility().equals(gender); }
    private void validateKey(String key) {
        if(key==null||!key.matches("[A-Za-z0-9_-]{1,64}")) throw new GachaException(400,"INVALID_REQUEST","작업 ID를 확인해주세요.");
    }
    private String write(Object value) {
        try { return json.writeValueAsString(value); } catch(JsonProcessingException error) { throw new IllegalStateException("뽑기 결과 저장 실패",error); }
    }
    private Result read(String value) {
        try { return json.readValue(value,Result.class); } catch(JsonProcessingException error) { throw new IllegalStateException("뽑기 결과 복구 실패",error); }
    }
    private String ledgerKey(long userId,String key) {
        try { return "gacha:"+userId+":"+HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(key.getBytes(StandardCharsets.UTF_8))); }
        catch(java.security.NoSuchAlgorithmException error) { throw new IllegalStateException(error); }
    }
}
