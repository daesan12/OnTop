# ⚙️ Backend_Convention

백엔드 Java 코드의 작성 형식을 아래 기준으로 통일합니다.

## 1. 코드 포맷

- 들여쓰기는 탭 대신 **공백 4칸**을 사용합니다.
- 줄바꿈한 연속 코드는 기존 들여쓰기보다 **8칸** 더 들여씁니다.
- 한 줄은 **120자**를 기준으로 작성합니다. 긴 URL·문자열은 예외로 둡니다.
- 인코딩은 **UTF-8**, 줄바꿈은 **LF**를 사용합니다.
- 파일 끝에는 개행을 넣고, 줄 끝 공백은 제거합니다.
- 여는 중괄호는 선언과 같은 줄에 둡니다.
- 한 줄짜리 `if`·반복문에도 중괄호를 사용합니다.
- 메서드 사이에는 빈 줄 하나를 둡니다.

```java
public boolean canJoin(int participantCount) {
    if (participantCount >= MAX_PARTICIPANTS) {
        return false;
    }

    return true;
}
```

## 2. 이름 규칙

| 대상 | 규칙 | 예시 |
| --- | --- | --- |
| 클래스·인터페이스·record·enum | PascalCase | `RoomService`, `JoinRoomRequest`, `RoomStatus` |
| 메서드·변수 | camelCase | `joinRoom`, `roomId`, `participantCount` |
| boolean 메서드 | `is`, `has`, `can` 등으로 의미 표현 | `isReady()`, `hasMember()`, `canJoin()` |
| 상수·enum 값 | UPPER_SNAKE_CASE | `MAX_PARTICIPANTS`, `WAITING` |
| 패키지 | 영문 소문자 | `room`, `config`, `exception` |

- 메서드는 동작이 드러나는 동사로 이름을 짓습니다.
- `cnt`, `mgr`, `tmp` 같은 불필요한 축약 대신 의미가 드러나는 단어를 사용합니다. 반복문의 `i`, `j`는 허용합니다.
- 요청 DTO는 `~Request`, 응답 DTO는 `~Response`, 예외 클래스는 `~Exception`으로 이름을 짓습니다.
- `DTO`, `Data`, `Util`만으로 이름을 짓지 않고 용도를 표현합니다.

## 3. import·주석

- 와일드카드 import는 사용하지 않습니다.
- 사용하지 않는 import는 제거합니다.
- 일반 import와 static import를 빈 줄로 구분하고, static import를 뒤에 둡니다.
- 각 import 그룹은 전체 경로 기준 사전순으로 정렬합니다.
- 주석은 한국어로 작성해도 됩니다.
- 코드가 무엇을 하는지 반복하기보다, 필요한 이유와 제약을 설명합니다.
- 주석 처리한 미사용 코드는 남기지 않습니다.

## 4. 패키지 구성

기능별 패키지 안에서 역할에 따라 나눕니다. 아래는 `room` 기능의 구성 예시입니다.

```text
기본패키지
├── room
│   ├── controller
│   ├── service
│   ├── domain
│   ├── dto
│   └── repository
└── global
    ├── config
    └── exception
```

- 필요한 패키지만 생성하고 빈 패키지를 미리 만들지 않습니다.
- 한 기능에서만 쓰는 클래스는 해당 기능 패키지에 둡니다.
- `global`에는 여러 기능에서 실제로 공유하는 클래스만 둡니다.
- 최상위 클래스는 파일 하나에 하나씩 작성하고, 파일명과 클래스명을 일치시킵니다.

## 5. 객체·DTO 작성

- 의존성은 `private final` 필드와 생성자로 주입합니다. 필드 주입은 사용하지 않습니다.
- 단일 생성자의 주입용 `@Autowired`는 생략합니다.
- 요청·응답 DTO는 단순한 불변 데이터라면 `record`를 사용합니다.
- 변경 가능한 상태나 프레임워크 제약이 있는 객체에는 record를 강제하지 않습니다.
- 불필요한 getter·setter·생성자는 만들지 않습니다.
- 상태 변경은 의미가 드러나는 메서드로 표현합니다. 예: `setStatus(...)`보다 `startGame()`.
- 반환할 목록이 비어 있으면 `null` 대신 빈 컬렉션을 반환합니다.
- `Optional`은 조회 결과가 없을 수 있는 반환값에 사용하고, 필드·메서드 인자로 사용하지 않습니다.
- `var`는 우변만으로 타입이 명확한 지역 변수에만 사용합니다.

```java
public record JoinRoomRequest(String roomId) {
}
```

## 6. 예외·로그 작성

- 예외를 무시하는 빈 `catch` 블록을 작성하지 않습니다.
- 처리할 수 있는 구체적인 예외를 잡습니다. 단순히 오류를 숨기기 위한 `catch (Exception)`은 사용하지 않습니다.
- 예외 메시지는 실패 원인이 드러나도록 작성합니다.
- `System.out.println`·`printStackTrace` 대신 SLF4J를 사용합니다.
- 로그는 문자열 연결 대신 `{}`와 인자를 사용합니다.
- 예외 로그를 남길 때는 메시지만 기록하지 않고 예외 객체를 전달합니다.
- 같은 예외를 여러 계층에서 중복 기록하지 않습니다.
- 비밀번호·토큰·쿠키 등 민감정보는 로그에 남기지 않습니다.

```java
log.info("방 생성 완료: roomId={}", roomId);
log.error("메시지 처리 실패: roomId={}", roomId, exception);
```

## 7. 테스트 작성

- 테스트 클래스는 **대상 클래스명 + `Tests`**로 작성합니다. 예: `RoomServiceTests`.
- 테스트 메서드는 **조건과 기대 결과가 드러나는 한글 이름**으로 작성하고 단어는 밑줄로 구분합니다.
- 테스트 내부는 **준비 → 실행 → 검증** 순서로 작성하고, 각 단계를 빈 줄로 구분합니다.
- 검증문은 AssertJ를 사용하고, 예외 검증에는 `assertThatThrownBy`를 사용합니다.
- 하나의 테스트는 하나의 동작을 검증합니다. 같은 결과를 설명하는 여러 검증문은 함께 작성할 수 있습니다.

```java
@Test
void 정원이_가득_차면_입장을_거절한다() {
    // given: 준비

    // when: 실행

    // then: 검증
}
```
