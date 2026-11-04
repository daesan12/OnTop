package com.ssafy.ontop.operation.service;

public class ServiceOperationConflictException extends RuntimeException {
    public ServiceOperationConflictException() {
        super("운영 상태가 먼저 변경되었습니다. 최신 상태를 확인한 뒤 다시 시도해주세요.");
    }
}
