import fingerspellingSheetUrl from "../../media/korean-fingerspelling-sheet.png";

interface CropPosition {
  readonly x: number;
  readonly y: number;
}

const GUIDE_CROPS: Readonly<Record<string, CropPosition>> = {
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

const SOURCE_CROP_INSET = 5;
const SOURCE_CROP_SIZE = 74;
const SOURCE_IMAGE_WIDTH = 815;
const SOURCE_IMAGE_HEIGHT = 750;

export function SignGuideImage({
  symbol,
  size = 86,
  responsive = false,
}: {
  readonly symbol: string | null;
  readonly size?: number;
  readonly responsive?: boolean;
}): React.JSX.Element {
  const crop = symbol ? GUIDE_CROPS[symbol] : undefined;
  const scale = size / SOURCE_CROP_SIZE;
  const viewportStyle = responsive ? undefined : { width: size, height: size };
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
