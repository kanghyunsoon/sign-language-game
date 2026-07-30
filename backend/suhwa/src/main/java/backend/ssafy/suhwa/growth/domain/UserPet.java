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

    @Column(nullable = false)
    private int level;

    @Column(nullable = false)
    private int exp;

    @Builder
    public UserPet(Long userId, Integer level, Integer exp) {
        this.userId = userId;
        this.level = level == null ? 1 : level;
        this.exp = exp == null ? 0 : exp;
        validateState();
    }

    public void addExperience(int amount, int expPerLevel, int maxLevel) {
        if (amount < 0 || expPerLevel <= 0 || maxLevel < 1) {
            throw new IllegalArgumentException("성장 정책 값이 올바르지 않습니다.");
        }
        if (level >= maxLevel) {
            level = maxLevel;
            exp = 0;
            return;
        }

        exp += amount;
        while (exp >= expPerLevel && level < maxLevel) {
            exp -= expPerLevel;
            level++;
        }
        if (level >= maxLevel) {
            level = maxLevel;
            exp = 0;
        }
    }

    public EvolutionStage evolutionStage(int firstEvolutionLevel, int finalEvolutionLevel) {
        if (level >= finalEvolutionLevel) {
            return EvolutionStage.STAGE_3;
        }
        if (level >= firstEvolutionLevel) {
            return EvolutionStage.STAGE_2;
        }
        return EvolutionStage.STAGE_1;
    }

    private void validateState() {
        if (level < 1 || exp < 0) {
            throw new IllegalArgumentException("펫 성장 상태가 올바르지 않습니다.");
        }
    }
}
