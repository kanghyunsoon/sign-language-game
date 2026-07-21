package backend.ssafy.suhwa.growth.repository;

import backend.ssafy.suhwa.growth.domain.UserPet;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserPetRepository extends JpaRepository<UserPet, Long> {
}
