package backend.ssafy.suhwa.user.domain;

import backend.ssafy.suhwa.common.domain.BaseTimeEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;

@Entity
@Table(name = "users")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
// 소프트 삭제(FR-007): 탈퇴(deleted_at 설정) 회원은 모든 JPA 조회에서 자동 제외된다.
// 서비스마다 isDeleted 필터를 중복 작성하지 않도록 엔티티 레벨에서 일괄 적용한다.
@SQLRestriction("deleted_at IS NULL")
public class User extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String email;

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    @Column(nullable = false, length = 50)
    private String nickname;

    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    @Builder
    public User(String email, String passwordHash, String nickname) {
        this.email = email;
        this.passwordHash = passwordHash;
        this.nickname = nickname;
    }

    public boolean isDeleted() {
        return deletedAt != null;
    }

    public void updateProfile(String nickname) {
        if (nickname != null) {
            this.nickname = nickname;
        }
    }

    public void withdraw() {
        this.deletedAt = LocalDateTime.now();
        this.email = "deleted_%d_%d@withdrawn.local".formatted(this.id, System.currentTimeMillis());
    }
}
