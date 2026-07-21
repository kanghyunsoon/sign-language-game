package backend.ssafy.suhwa.growth.domain;

import backend.ssafy.suhwa.common.domain.BaseTimeEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** 엔티티만 정의(API/로직 없음, FR-034). 회원가입 시 row 생성 여부 등은 1차 범위 밖. */
@Entity
@Table(name = "user_pets")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class UserPet extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false, unique = true)
    private Long userId;

    @Column(length = 50)
    private String name;

    @Column(nullable = false)
    private int level;

    @Column(nullable = false)
    private int exp;

    @Builder
    public UserPet(Long userId, String name) {
        this.userId = userId;
        this.name = name;
        this.level = 1;
        this.exp = 0;
    }
}
