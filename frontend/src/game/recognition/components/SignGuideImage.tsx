import number1Url from "../../assets/guides/number-1.png";
import number2Url from "../../assets/guides/number-2.png";
import number3Url from "../../assets/guides/number-3.png";
import number4Url from "../../assets/guides/number-4.png";
import number5Url from "../../assets/guides/number-5.png";
import number6Url from "../../assets/guides/number-6.png";
import number7Url from "../../assets/guides/number-7.png";
import number8Url from "../../assets/guides/number-8.png";
import number9Url from "../../assets/guides/number-9.png";
import fingerspellingSheetUrl from "../../media/korean-fingerspelling-sheet.png";
import consonantGiyeokUrl from "../../../features/learning/assets/consonant/consonant-giyeok.png";
import consonantNieunUrl from "../../../features/learning/assets/consonant/consonant-nieun.png";
import consonantDigeutUrl from "../../../features/learning/assets/consonant/consonant-digeut.png";
import consonantRieulUrl from "../../../features/learning/assets/consonant/consonant-rieul.png";
import consonantMieumUrl from "../../../features/learning/assets/consonant/consonant-mieum.png";
import consonantBieupUrl from "../../../features/learning/assets/consonant/consonant-bieup.png";
import consonantSiotUrl from "../../../features/learning/assets/consonant/consonant-siot.png";
import consonantIeungUrl from "../../../features/learning/assets/consonant/consonant-ieung.png";
import consonantJieutUrl from "../../../features/learning/assets/consonant/consonant-jieut.png";
import consonantChieutUrl from "../../../features/learning/assets/consonant/consonant-chieut.png";
import consonantKieukUrl from "../../../features/learning/assets/consonant/consonant-kieuk.png";
import consonantTieutUrl from "../../../features/learning/assets/consonant/consonant-tieut.png";
import consonantPieupUrl from "../../../features/learning/assets/consonant/consonant-pieup.png";
import consonantHieutUrl from "../../../features/learning/assets/consonant/consonant-hieut.png";
import vowelAUrl from "../../../features/learning/assets/vowel/vowel-a.png";
import vowelAeUrl from "../../../features/learning/assets/vowel/vowel-ae.png";
import vowelYaUrl from "../../../features/learning/assets/vowel/vowel-ya.png";
import vowelYaeUrl from "../../../features/learning/assets/vowel/vowel-yae.png";
import vowelEoUrl from "../../../features/learning/assets/vowel/vowel-eo.png";
import vowelEUrl from "../../../features/learning/assets/vowel/vowel-e.png";
import vowelYeoUrl from "../../../features/learning/assets/vowel/vowel-yeo.png";
import vowelYeUrl from "../../../features/learning/assets/vowel/vowel-ye.png";
import vowelOUrl from "../../../features/learning/assets/vowel/vowel-o.png";
import vowelYoUrl from "../../../features/learning/assets/vowel/vowel-yo.png";
import vowelUUrl from "../../../features/learning/assets/vowel/vowel-u.png";
import vowelYuUrl from "../../../features/learning/assets/vowel/vowel-yu.png";
import vowelEuUrl from "../../../features/learning/assets/vowel/vowel-eu.png";
import vowelUiUrl from "../../../features/learning/assets/vowel/vowel-ui.png";
import vowelIUrl from "../../../features/learning/assets/vowel/vowel-i.png";
import vowelOeUrl from "../../../features/learning/assets/vowel/vowel-oe.png";
import vowelWiUrl from "../../../features/learning/assets/vowel/vowel-wi.png";

interface CropPosition {
  readonly x: number;
  readonly y: number;
}

/**
 * Verified against korean-fingerspelling-sheet.png.  Keep this table keyed by
 * the actual game symbol; target text and the displayed hand image therefore
 * cannot use two different aliases for the same sign.
 */
export const SIGN_GUIDE_CROPS: Readonly<Record<string, CropPosition>> = {
  "ㄱ": { x: 31, y: 21 }, "ㄴ": { x: 219, y: 21 },
  "ㄷ": { x: 31, y: 143 }, "ㄹ": { x: 219, y: 143 },
  "ㅁ": { x: 31, y: 265 }, "ㅂ": { x: 125, y: 265 },
  "ㅅ": { x: 31, y: 387 }, "ㅇ": { x: 125, y: 387 }, "ㅈ": { x: 219, y: 387 },
  "ㅊ": { x: 125, y: 509 }, "ㅋ": { x: 219, y: 509 },
  "ㅌ": { x: 31, y: 631 }, "ㅍ": { x: 125, y: 631 }, "ㅎ": { x: 219, y: 631 },
  "ㅏ": { x: 388, y: 21 }, "ㅑ": { x: 482, y: 21 }, "ㅓ": { x: 576, y: 21 }, "ㅕ": { x: 669, y: 21 },
  "ㅗ": { x: 388, y: 143 }, "ㅛ": { x: 482, y: 143 }, "ㅜ": { x: 576, y: 143 }, "ㅠ": { x: 669, y: 143 },
  "ㅡ": { x: 388, y: 265 }, "ㅣ": { x: 482, y: 265 }, "ㅐ": { x: 576, y: 265 }, "ㅔ": { x: 669, y: 265 },
  "ㅒ": { x: 388, y: 387 }, "ㅖ": { x: 482, y: 387 }, "ㅚ": { x: 576, y: 387 }, "ㅟ": { x: 669, y: 387 },
  "ㅢ": { x: 388, y: 509 },
};

export const SIGN_GUIDE_NUMBER_SYMBOLS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

const NUMBER_GUIDES: Readonly<Record<(typeof SIGN_GUIDE_NUMBER_SYMBOLS)[number], string>> = {
  "1": number1Url,
  "2": number2Url,
  "3": number3Url,
  "4": number4Url,
  "5": number5Url,
  "6": number6Url,
  "7": number7Url,
  "8": number8Url,
  "9": number9Url,
};

// The solo game, practice screens, and hand-guide overlays deliberately share
// the same approved learning assets.  Keeping the mapping here prevents a
// target glyph and its hint picture from drifting apart again.
const LEARNING_GUIDES: Readonly<Record<string, string>> = {
  "ㄱ": consonantGiyeokUrl, "ㄴ": consonantNieunUrl, "ㄷ": consonantDigeutUrl,
  "ㄹ": consonantRieulUrl, "ㅁ": consonantMieumUrl, "ㅂ": consonantBieupUrl,
  "ㅅ": consonantSiotUrl, "ㅇ": consonantIeungUrl, "ㅈ": consonantJieutUrl,
  "ㅊ": consonantChieutUrl, "ㅋ": consonantKieukUrl, "ㅌ": consonantTieutUrl,
  "ㅍ": consonantPieupUrl, "ㅎ": consonantHieutUrl,
  "ㅏ": vowelAUrl, "ㅐ": vowelAeUrl, "ㅑ": vowelYaUrl, "ㅒ": vowelYaeUrl,
  "ㅓ": vowelEoUrl, "ㅔ": vowelEUrl, "ㅕ": vowelYeoUrl, "ㅖ": vowelYeUrl,
  "ㅗ": vowelOUrl, "ㅛ": vowelYoUrl, "ㅜ": vowelUUrl, "ㅠ": vowelYuUrl,
  "ㅡ": vowelEuUrl, "ㅢ": vowelUiUrl, "ㅣ": vowelIUrl, "ㅚ": vowelOeUrl,
  "ㅟ": vowelWiUrl,
};

const SOURCE_CROP_INSET = 5;
const SOURCE_CROP_SIZE = 74;
const SOURCE_IMAGE_WIDTH = 815;
const SOURCE_IMAGE_HEIGHT = 750;

/** True only when the exact game symbol has an approved visual guide. */
export function hasSignGuide(symbol: string | null): boolean {
  if (!symbol) return false;
  return symbol in NUMBER_GUIDES || symbol in LEARNING_GUIDES || symbol in SIGN_GUIDE_CROPS;
}

function numberGuideFor(symbol: string | null): string | undefined {
  if (!symbol || !(symbol in NUMBER_GUIDES)) return undefined;
  return NUMBER_GUIDES[symbol as keyof typeof NUMBER_GUIDES];
}

export function SignGuideImage({
  symbol,
  size = 86,
  responsive = false,
}: {
  readonly symbol: string | null;
  readonly size?: number;
  readonly responsive?: boolean;
}): React.JSX.Element {
  const numberGuide = numberGuideFor(symbol);
  const learningGuide = symbol ? LEARNING_GUIDES[symbol] : undefined;
  const crop = symbol ? SIGN_GUIDE_CROPS[symbol] : undefined;
  const scale = size / SOURCE_CROP_SIZE;
  const viewportStyle = responsive ? undefined : { width: size, height: size };
  if (numberGuide) {
    return <img className={`sign-guide-number${responsive ? " sign-guide-responsive" : ""}`} style={responsive ? undefined : { width: size, height: size }} src={numberGuide} alt={`${symbol} 지숫자 손 모양`} draggable={false} />;
  }

  if (learningGuide) {
    return <img className={`sign-guide-learning${responsive ? " sign-guide-responsive" : ""}`} style={responsive ? undefined : { width: size, height: size }} src={learningGuide} alt={`${symbol} 지문자 손 모양`} draggable={false} />;
  }

  if (!symbol || !crop) {
    return <span className={`sign-guide-crop sign-guide-empty${responsive ? " sign-guide-responsive" : ""}`} style={viewportStyle} aria-label="수화 안내 이미지 없음" />;
  }

  return (
    <span className={`sign-guide-crop${responsive ? " sign-guide-responsive" : ""}`} style={viewportStyle} role="img" aria-label={`${symbol} 수화 손 모양`}>
      <img
        src={fingerspellingSheetUrl}
        alt=""
        style={{
          left: responsive ? `${-((crop.x + SOURCE_CROP_INSET) / SOURCE_CROP_SIZE) * 100}%` : -(crop.x + SOURCE_CROP_INSET) * scale,
          top: responsive ? `${-((crop.y + SOURCE_CROP_INSET) / SOURCE_CROP_SIZE) * 100}%` : -(crop.y + SOURCE_CROP_INSET) * scale,
          width: responsive ? `${(SOURCE_IMAGE_WIDTH / SOURCE_CROP_SIZE) * 100}%` : SOURCE_IMAGE_WIDTH * scale,
          height: responsive ? `${(SOURCE_IMAGE_HEIGHT / SOURCE_CROP_SIZE) * 100}%` : SOURCE_IMAGE_HEIGHT * scale,
        }}
        draggable={false}
      />
    </span>
  );
}
