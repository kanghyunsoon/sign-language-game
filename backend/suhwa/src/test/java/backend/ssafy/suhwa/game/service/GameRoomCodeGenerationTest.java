package backend.ssafy.suhwa.game.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import backend.ssafy.suhwa.auth.service.RealtimeTicketService;
import backend.ssafy.suhwa.common.exception.BusinessException;
import backend.ssafy.suhwa.common.exception.ErrorCode;
import backend.ssafy.suhwa.game.domain.GameType;
import backend.ssafy.suhwa.game.realtime.LobbyBroadcastService;
import backend.ssafy.suhwa.game.realtime.RoomParticipantRegistry;
import backend.ssafy.suhwa.game.realtime.RoomRealtimeNotifier;
import backend.ssafy.suhwa.game.repository.GameRoomRepository;
import backend.ssafy.suhwa.gameresult.service.GameResultService;
import backend.ssafy.suhwa.user.service.UserService;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.scheduling.TaskScheduler;

/**
 * 방 코드 생성이 반복 충돌로 실패했을 때 표준 예외가 아니라 도메인 예외를 던지는지 검증한다
 * (spec 004 FR-014, GAME-02-15).
 *
 * <p>충돌은 확률적으로만 발생해 실제 데이터로는 재현할 수 없으므로, 리포지토리가 "이미 있는
 * 코드"라고 답하도록 만들어 재시도 한도를 강제로 소진시킨다. Spring 컨텍스트 없이 서비스를 직접
 * 조립한다 — 이 경로는 DB 상태와 무관하다.
 */
class GameRoomCodeGenerationTest {

    private GameRoomService serviceWith(GameRoomRepository repository) {
        return new GameRoomService(
                repository,
                Mockito.mock(UserService.class),
                Mockito.mock(GameResultService.class),
                Mockito.mock(RoomRealtimeNotifier.class),
                Mockito.mock(LobbyBroadcastService.class),
                new RoomParticipantRegistry(),
                new RealtimeTicketService(60L),
                Mockito.mock(TaskScheduler.class),
                15L,
                Mockito.mock(GameRoomService.class));
    }

    @Test
    void repeatedRoomCodeCollision_throwsDomainExceptionNotStandardOne() {
        GameRoomRepository repository = Mockito.mock(GameRoomRepository.class);
        // 생성하는 코드마다 이미 존재한다고 답해 재시도 한도를 소진시킨다.
        Mockito.when(repository.existsByRoomCode(Mockito.anyString())).thenReturn(true);

        assertThatThrownBy(() -> serviceWith(repository).create(1L, GameType.SIGN_DUEL))
                .isInstanceOf(BusinessException.class)
                .satisfies(thrown -> {
                    BusinessException e = (BusinessException) thrown;
                    assertThat(e.getCode()).isEqualTo(ErrorCode.ROOM_CODE_GENERATION_FAILED.name());
                    assertThat(e.getStatus()).isEqualTo(ErrorCode.ROOM_CODE_GENERATION_FAILED.getStatus());
                });

        // 한도를 소진할 때까지 재시도했는지도 함께 확인한다 — 첫 충돌에 바로 포기하면 안 된다.
        Mockito.verify(repository, Mockito.atLeast(2)).existsByRoomCode(Mockito.anyString());
        Mockito.verify(repository, Mockito.never()).save(Mockito.any());
    }
}
