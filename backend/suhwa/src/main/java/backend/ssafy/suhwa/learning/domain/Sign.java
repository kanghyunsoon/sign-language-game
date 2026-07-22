package backend.ssafy.suhwa.learning.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

@Entity
@Table(name = "signs")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Sign {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private SignCategory category;

    @Column(nullable = false, length = 50)
    private String label;

    @Column(name = "reference_media_url", length = 500)
    private String referenceMediaUrl;

    @Column(length = 500)
    private String tip;

    @Column(name = "is_active", nullable = false)
    private boolean active;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Builder
    public Sign(SignCategory category, String label, String referenceMediaUrl, String tip) {
        this.category = category;
        this.label = label;
        this.referenceMediaUrl = referenceMediaUrl;
        this.tip = tip;
        this.active = true;
    }
}
