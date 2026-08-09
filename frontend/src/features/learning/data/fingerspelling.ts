import bieupImage from "../assets/consonant/consonant-bieup.webp";
import chieutImage from "../assets/consonant/consonant-chieut.webp";
import digeutImage from "../assets/consonant/consonant-digeut.webp";
import giyeokImage from "../assets/consonant/consonant-giyeok.webp";
import hieutImage from "../assets/consonant/consonant-hieut.webp";
import ieungImage from "../assets/consonant/consonant-ieung.webp";
import jieutImage from "../assets/consonant/consonant-jieut.webp";
import kieukImage from "../assets/consonant/consonant-kieuk.webp";
import mieumImage from "../assets/consonant/consonant-mieum.webp";
import nieunImage from "../assets/consonant/consonant-nieun.webp";
import pieupImage from "../assets/consonant/consonant-pieup.webp";
import rieulImage from "../assets/consonant/consonant-rieul.webp";
import siotImage from "../assets/consonant/consonant-siot.webp";
import tieutImage from "../assets/consonant/consonant-tieut.webp";
import aImage from "../assets/vowel/vowel-a.webp";
import aeImage from "../assets/vowel/vowel-ae.webp";
import eImage from "../assets/vowel/vowel-e.webp";
import eSideImage from "../assets/vowel/vowel-e-side.webp";
import eoImage from "../assets/vowel/vowel-eo.webp";
import eoSideImage from "../assets/vowel/vowel-eo-side.webp";
import euImage from "../assets/vowel/vowel-eu.webp";
import iImage from "../assets/vowel/vowel-i.webp";
import oImage from "../assets/vowel/vowel-o.webp";
import oeImage from "../assets/vowel/vowel-oe.webp";
import uImage from "../assets/vowel/vowel-u.webp";
import uiImage from "../assets/vowel/vowel-ui.webp";
import wiImage from "../assets/vowel/vowel-wi.webp";
import yaImage from "../assets/vowel/vowel-ya.webp";
import yaeImage from "../assets/vowel/vowel-yae.webp";
import yeImage from "../assets/vowel/vowel-ye.webp";
import yeSideImage from "../assets/vowel/vowel-ye-side.webp";
import yeoImage from "../assets/vowel/vowel-yeo.webp";
import yeoSideImage from "../assets/vowel/vowel-yeo-side.webp";
import yoImage from "../assets/vowel/vowel-yo.webp";
import yuImage from "../assets/vowel/vowel-yu.webp";
import oneImage from "../assets/number/number-one.webp";
import twoImage from "../assets/number/number-two.webp";
import threeImage from "../assets/number/number-three.webp";
import fourImage from "../assets/number/number-four.webp";
import fiveImage from "../assets/number/number-five.webp";
import sixImage from "../assets/number/number-six.webp";
import sevenImage from "../assets/number/number-seven.webp";
import eightImage from "../assets/number/number-eight.webp";
import nineImage from "../assets/number/number-nine.webp";
import tenImage from "../assets/number/number-ten.webp";

/** 지문자 분류 식별자. */
export type FingerspellingCategoryId = "consonant" | "vowel" | "number";

/** 지문자 한 글자의 학습 데이터. */
export interface FingerspellingItem {
  /** 화면에 노출하는 글자 또는 숫자. 41개 전체에서 유일하다. */
  symbol: string;
  /** 글자의 한글 이름(기역, 아, 하나 등). */
  name: string;
  /** 지문자 동작 사진(Vite 정적 import URL). */
  image: string;
  /**
   * 같은 동작을 옆에서 본 보조 사진. 손끝을 앞으로 내미는 ㅓ·ㅕ·ㅔ·ㅖ처럼
   * 정면 그림만으로는 손의 방향을 알기 어려운 글자에만 있다.
   */
  sideImage?: string;
  /** 수형 설명 문장. 설명 칸이 3줄 고정 높이라 3줄을 넘기지 않는다. */
  description: string[];
}

/** 사전 좌측 분류 트리에서 사용하는 분류 메타데이터. */
export interface FingerspellingCategory {
  id: FingerspellingCategoryId;
  /** 화면에 노출하는 분류명(자음/모음/숫자). */
  label: string;
  /** 분류를 대표하는 글자. */
  symbol: string;
}

/** 분류 정보가 붙은 평면 항목. 검색 결과와 상세 표시에 사용한다. */
export interface FingerspellingEntry extends FingerspellingItem {
  categoryId: FingerspellingCategoryId;
  categoryLabel: string;
}

/** 사전 진입 시 기본으로 선택되는 글자. */
export const DEFAULT_FINGERSPELLING_SYMBOL = "ㄱ";

export const fingerspellingCategories: FingerspellingCategory[] = [
  { id: "consonant", label: "자음", symbol: "ㄱ" },
  { id: "vowel", label: "모음", symbol: "ㅏ" },
  { id: "number", label: "숫자", symbol: "1" },
];

/**
 * 분류별 지문자 목록. 연습 화면이 순서대로 진행하므로 배열 순서를 바꾸지 않는다.
 * 숫자는 보유한 지문자 이미지에 맞춰 1~10을 제공한다.
 */
export const fingerspellingItems: Record<
  FingerspellingCategoryId,
  FingerspellingItem[]
> = {
  consonant: [
    {
      symbol: "ㄱ",
      name: "기역",
      image: giyeokImage,
      description: [
        "검지를 아래로 곧게 펴고,",
        "엄지와 검지를 제외한 나머지 손가락은 접어주세요.",
        "손등이 보이도록 손을 내립니다.",
      ],
    },
    {
      symbol: "ㄴ",
      name: "니은",
      image: nieunImage,
      description: [
        "검지는 옆으로, 엄지는 위로 곧게 펴서", 
        "두 손가락이 직각을 이루게 해주세요.",
        "나머지 손가락은 손바닥 안쪽으로 접습니다.",
      ],
    },
    {
      symbol: "ㄷ",
      name: "디귿",
      image: digeutImage,
      description: [
        "검지와 중지를 나란히 펴고, 나머지 손가락은 접어주세요.",
        "손등이 보이도록 손을 옆으로 향하게 합니다.",
      ],
    },
    {
      symbol: "ㄹ",
      name: "리을",
      image: rieulImage,
      description: [
        "검지·중지·약지를 옆으로 나란히 펴고,",
        "나머지 손가락은 접고 손등이 보이게 합니다.",
        "ㅌ과 구분되도록 세 손가락 사이를 살짝 벌려주세요.",
      ],
    },
    {
      symbol: "ㅁ",
      name: "미음",
      image: mieumImage,
      description: [
        "검지와 중지를 반쯤 접고, 다른 손가락은 접어주세요.",
        "손바닥이 앞을 향하게 합니다.",
      ],
    },
    {
      symbol: "ㅂ",
      name: "비읍",
      image: bieupImage,
      description: [
        "엄지를 접고, 나머지 손가락을 나란히 펴주세요",
        "손바닥이 앞을 향하게 합니다.",
      ],
    },
    {
      symbol: "ㅅ",
      name: "시옷",
      image: siotImage,
      description: [
        "검지와 중지를 아래로 나란히 펴고,",
        "나머지 손가락은 접고 손등이 보이게 합니다.",
        "ㅠ와 구분되도록 손목을 살짝 꺾어 손끝을 비스듬히 내려주세요.",
      ],
    },
    {
      symbol: "ㅇ",
      name: "이응",
      image: ieungImage,
      description: [
        "엄지와 검지 끝을 맞대어 동그라미를 만들어주세요.",
        "다른 손가락은 위로 펴고 손바닥이 앞을 향하게 합니다.",
      ],
    },
    {
      symbol: "ㅈ",
      name: "지읒",
      image: jieutImage,
      description: [
        "검지와 중지를 아래로 나란히 펴고,", 
        "엄지는 옆으로 벌려주세요.",
        "약지와 새끼손가락은 접고 손등이 보이도록 합니다.",
      ],
    },
    {
      symbol: "ㅊ",
      name: "치읓",
      image: chieutImage,
      description: [
        "검지·중지·약지를 아래로 펴고, 엄지는 옆으로 벌려주세요.",
        "새끼손가락을 접고 손등이 보이도록",
        "손끝을 아래로 향하게 합니다.",
      ],
    },
    {
      symbol: "ㅋ",
      name: "키읔",
      image: kieukImage,
      description: [
        "가운데 손가락을 아래로 펴고,", 
        "나머지 손가락은 접어주세요.",
        "엄지는 옆으로 벌리고 손등이 보이도록 합니다.",
      ],
    },
    {
      symbol: "ㅌ",
      name: "티읕",
      image: tieutImage,
      description: [
        "검지·중지·약지를 옆으로 나란히 펴고,",
        "나머지 손가락은 접고 손등이 보이게 합니다.",
        "ㄹ과 구분되도록 세 손가락을 서로 붙여주세요.",
      ],
    },
    {
      symbol: "ㅍ",
      name: "피읖",
      image: pieupImage,
      description: [
        "네 손가락을 모두 접어 주먹을 만들어주세요.",
        "엄지는 접은 손가락 앞쪽을 감싸고",
        "손바닥 쪽이 보이도록 세웁니다.",
      ],
    },
    {
      symbol: "ㅎ",
      name: "히읗",
      image: hieutImage,
      description: [
        "네 손가락을 접어 주먹을 만들고,", 
        "엄지만 위로 곧게 세워주세요.",
        "손가락이 앞쪽을 향하도록 합니다.",
      ],
    },
  ],
  vowel: [
    {
      symbol: "ㅏ",
      name: "아",
      image: aImage,
      description: [
        "검지를 위로 곧게 펴고,", 
        "나머지 손가락은 주먹을 쥐어주세요.",
        "손바닥이 앞을 향하도록 합니다.",
      ],
    },
    {
      symbol: "ㅑ",
      name: "야",
      image: yaImage,
      description: [
        "검지와 중지를 위로 나란히 펴고,", 
        "나머지 손가락은 접어주세요.",
        "손바닥이 앞을 향하도록 합니다.",
      ],
    },
    {
      symbol: "ㅓ",
      name: "어",
      image: eoImage,
      sideImage: eoSideImage,
      description: [
        "주먹을 쥔 상태에서 엄지를 옆으로 곧게 펴주세요.",
        "손가락이 앞을 향하도록 합니다.",
        "인식이 잘 되도록 손등이 살짝 보이게 손목을 돌려주세요.",
      ],
    },
    {
      symbol: "ㅕ",
      name: "여",
      image: yeoImage,
      sideImage: yeoSideImage,
      description: [
        "주먹을 쥔 상태에서 엄지와 검지를 옆으로 펴주세요.",
        "손가락이 앞을 향하도록 합니다.",
        "인식이 잘 되도록 손등이 살짝 보이게 손목을 돌려주세요.",
      ],
    },
    {
      symbol: "ㅗ",
      name: "오",
      image: oImage,
      description: [
        "검지를 위로 곧게 펴고, 나머지 손가락은 접어주세요.",
        "손등이 앞을 향하도록 합니다.",
      ],
    },
    {
      symbol: "ㅛ",
      name: "요",
      image: yoImage,
      description: [
        "검지와 중지를 위로 나란히 펴고,", 
        "나머지 손가락은 접어주세요.",
        "손등이 앞을 향하도록 합니다.",
      ],
    },
    {
      symbol: "ㅜ",
      name: "우",
      image: uImage,
      description: [
        "주먹을 쥔 상태에서 검지를 아래로 곧게 펴주세요.",
        "손등이 앞을 향하도록 합니다.",
      ],
    },
    {
      symbol: "ㅠ",
      name: "유",
      image: yuImage,
      description: [
        "주먹을 쥔 상태에서", 
        "검지와 중지를 아래로 나란히 펴주세요.",
        "손등이 앞을 향하도록 합니다.",
      ],
    },
    {
      symbol: "ㅡ",
      name: "으",
      image: euImage,
      description: [
        "검지를 옆으로 곧게 펴고, 나머지 손가락은 접어주세요.",
        "손바닥이 아래를 향하도록 합니다.",
      ],
    },
    {
      symbol: "ㅣ",
      name: "이",
      image: iImage,
      description: [
        "엄지와 새끼손가락을 펴고, 나머지 손가락은 접어주세요.",
        "손바닥이 앞을 향하도록 합니다.",
      ],
    },
    {
      symbol: "ㅐ",
      name: "애",
      image: aeImage,
      description: [
        "검지와 새끼손가락을 함께 위로 펴고,", 
        "나머지 손가락은 접어주세요.",
        "손바닥이 앞을 향하도록 합니다.",
      ],
    },
    {
      symbol: "ㅒ",
      name: "얘",
      image: yaeImage,
      description: [
        "엄지와 약지를 접고, 나머지 손가락은 접어주세요.",
        "손바닥이 앞을 향하도록 합니다.",
      ],
    },
    {
      symbol: "ㅔ",
      name: "에",
      image: eImage,
      sideImage: eSideImage,
      description: [
        "검지와 새끼손가락을 펴고, 나머지 손가락은 접어주세요.",
        "손가락이 앞을 향하도록 합니다.",
        "인식이 잘 되도록 손등이 살짝 보이게 손목을 돌려주세요.",
      ],
    },
    {
      symbol: "ㅖ",
      name: "예",
      image: yeImage,
      sideImage: yeSideImage,
      description: [
        "엄지와 약지를 접고, 나머지 손가락은 펴주세요.",
        "손가락이 앞을 향하도록 합니다.",
        "인식이 잘 되도록 손등이 살짝 보이게 손목을 돌려주세요.",
      ],
    },
    {
      symbol: "ㅚ",
      name: "외",
      image: oeImage,
      description: [
        "검지와 새끼손가락을 펴고, 나머지 손가락은 접어주세요.",
        "손등이 앞을 향하도록 합니다.",
      ],
    },
    {
      symbol: "ㅟ",
      name: "위",
      image: wiImage,
      description: [
        "검지와 새끼손가락을 펴고, 나머지 손가락은 접어주세요.",
        "손가락은 바닥을, 손등은 앞을 향하도록 합니다.",
      ],
    },
    {
      symbol: "ㅢ",
      name: "의",
      image: uiImage,
      description: [
        "검지와 새끼손가락을 펴고, 나머지 손가락은 접어주세요.",
        "손등이 앞을 향하도록 합니다.",
      ],
    },
  ],
  number: [
    {
      symbol: "1",
      name: "하나",
      image: oneImage,
      description: [
        "검지를 위로 곧게 펴고, 나머지 손가락은 접어주세요.",
        "손바닥이 앞을 향하도록 손을 세웁니다.",
      ],
    },
    {
      symbol: "2",
      name: "둘",
      image: twoImage,
      description: [
        "검지와 중지를 위로 나란히 펴고,", 
        "나머지 손가락은 접어주세요.",
        "손바닥이 앞을 향하도록 손을 세웁니다.",
      ],
    },
    {
      symbol: "3",
      name: "셋",
      image: threeImage,
      description: [
        "검지·중지·약지를 위로 나란히 펴고,",
        "나머지 손가락은 접어주세요.",
        "손바닥이 앞을 향하도록 손을 세웁니다.",
      ],
    },
    {
      symbol: "4",
      name: "넷",
      image: fourImage,
      description: [
        "엄지를 접고, 나머지 네 손가락을 위로 나란히 펴주세요.",
        "손바닥이 앞을 향하도록 손을 세웁니다.",
      ],
    },
    {
      symbol: "5",
      name: "다섯",
      image: fiveImage,
      description: [
        "네 손가락을 모두 접고, 엄지만 옆으로 곧게 펴주세요.",
        "손바닥이 앞을 향하도록 손을 세웁니다.",
      ],
    },
    {
      symbol: "6",
      name: "여섯",
      image: sixImage,
      description: [
        "엄지를 위로, 검지를 옆으로 곧게 펴고,",
        "나머지 손가락은 접어주세요.",
        "손등이 앞을 향하도록 손을 옆으로 기울입니다.",
      ],
    },
    {
      symbol: "7",
      name: "일곱",
      image: sevenImage,
      description: [
        "엄지는 위로 세우고,", 
        "검지와 중지는 옆으로 나란히 펴주세요.",
        "나머지 손가락은 접고, 손등이 앞을 향하도록 합니다.",
      ],
    },
    {
      symbol: "8",
      name: "여덟",
      image: eightImage,
      description: [
        "엄지는 위로 세우고,", 
        "검지·중지·약지는 옆으로 나란히 펴주세요.",
        "새끼손가락은 접고, 손등이 앞을 향하도록 합니다.",
      ],
    },
    {
      symbol: "9",
      name: "아홉",
      image: nineImage,
      description: [
        "엄지를 위로 세우고,", 
        "나머지 네 손가락을 옆으로 나란히 펴주세요.",
        "손등이 앞을 향하도록 손을 옆으로 기울입니다.",
      ],
    },
    {
      symbol: "10",
      name: "열",
      image: tenImage,
      description: [
        "엄지와 검지 끝을 맞대어 동그라미를 만들어주세요.",
        "나머지 세 손가락은 위로 자연스럽게 펴고,",
        "손바닥이 앞을 향하도록 합니다.",
      ],
    },
  ],
};

/** 분류 정보를 붙여 평탄화한 전체 지문자 목록. 분류 순서를 그대로 따른다. */
export const fingerspellingEntries: FingerspellingEntry[] =
  fingerspellingCategories.flatMap((category) =>
    fingerspellingItems[category.id].map((item) => ({
      ...item,
      categoryId: category.id,
      categoryLabel: category.label,
    })),
  );

/** symbol은 41개 전체에서 유일하므로 조회 키로 사용할 수 있다. */
const entryBySymbol = new Map(
  fingerspellingEntries.map((entry) => [entry.symbol, entry]),
);

/** 글자로 지문자 항목을 찾는다. 없으면 undefined. */
export function findFingerspellingEntry(
  symbol: string,
): FingerspellingEntry | undefined {
  return entryBySymbol.get(symbol);
}

/**
 * 글자·이름·분류명을 부분 일치로 검색한다. 빈 검색어는 빈 배열을 돌려준다.
 * 호환 자모 "ㄱ"은 조합 음절 "기역"에 포함되지 않으므로 symbol과 name을 모두 확인한다.
 */
export function searchFingerspellingEntries(
  query: string,
): FingerspellingEntry[] {
  const keyword = query.trim();

  if (!keyword) {
    return [];
  }

  return fingerspellingEntries.filter(
    (entry) =>
      entry.symbol.includes(keyword) ||
      entry.name.includes(keyword) ||
      entry.categoryLabel.includes(keyword),
  );
}
