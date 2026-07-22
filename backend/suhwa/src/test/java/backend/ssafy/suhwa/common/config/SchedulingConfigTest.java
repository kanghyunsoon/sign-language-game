package backend.ssafy.suhwa.common.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

/**
 * 스케줄러 전용 스레드풀(FR-005, PERF-7)이 실제로 풀 크기 1의 기본 스케줄러가 아니라
 * 여러 작업을 동시에 실행할 수 있는지 검증한다.
 */
@SpringBootTest
class SchedulingConfigTest {

    @Autowired
    private TaskScheduler taskScheduler;

    @Test
    void taskScheduler_hasPoolSizeOfAtLeastFour() {
        assertThat(taskScheduler).isInstanceOf(ThreadPoolTaskScheduler.class);
        assertThat(((ThreadPoolTaskScheduler) taskScheduler).getPoolSize()).isGreaterThanOrEqualTo(4);
    }

    @Test
    void longRunningTask_doesNotDelayOtherScheduledTask() throws InterruptedException {
        CountDownLatch quickTaskRan = new CountDownLatch(1);
        AtomicBoolean longTaskStillRunning = new AtomicBoolean(true);

        taskScheduler.schedule(() -> {
            try {
                Thread.sleep(2000);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            } finally {
                longTaskStillRunning.set(false);
            }
        }, Instant.now());

        taskScheduler.schedule(quickTaskRan::countDown, Instant.now().plusMillis(100));

        boolean quickTaskRanInTime = quickTaskRan.await(1, TimeUnit.SECONDS);

        assertThat(quickTaskRanInTime)
                .as("풀 크기가 1이었다면 긴 작업이 스레드를 점유하는 동안 이 작업은 실행되지 못했을 것이다")
                .isTrue();
        assertThat(longTaskStillRunning.get())
                .as("이 시점에도 긴 작업이 여전히 실행 중이어야, 짧은 작업이 그것을 기다리지 않고 별도 스레드에서 실행됐다는 뜻이 된다")
                .isTrue();
    }
}
