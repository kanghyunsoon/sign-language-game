package backend.ssafy.suhwa.learning.dto;

import backend.ssafy.suhwa.learning.domain.Sign;
import backend.ssafy.suhwa.learning.domain.SignCategory;

public record SignResponse(
        Long id,
        SignCategory category,
        String label,
        String referenceMediaUrl,
        String tip) {

    public static SignResponse from(Sign sign) {
        return new SignResponse(
                sign.getId(), sign.getCategory(), sign.getLabel(),
                sign.getReferenceMediaUrl(), sign.getTip());
    }
}
