package backend.ssafy.suhwa.growth.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.LocalDate;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

@Entity
@Table(
        name = "attendance",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_attendance_user_date",
                columnNames = {"user_id", "attendance_date"}))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Attendance {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "attendance_date", nullable = false)
    private LocalDate attendanceDate;

    @Column(name = "streak_count", nullable = false)
    private int streakCount;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Builder
    public Attendance(Long userId, LocalDate attendanceDate, Integer streakCount) {
        if (userId == null || attendanceDate == null) {
            throw new IllegalArgumentException("출석 사용자와 날짜는 필수입니다.");
        }
        if (streakCount != null && streakCount < 1) {
            throw new IllegalArgumentException("연속 출석 일수는 1 이상이어야 합니다.");
        }
        this.userId = userId;
        this.attendanceDate = attendanceDate;
        this.streakCount = streakCount == null ? 1 : streakCount;
    }
}
