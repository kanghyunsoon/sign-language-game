"""Readable and machine-readable training report generation.""";

from dataclasses import asdict;
from html import escape;
import json;
from pathlib import Path;
from typing import Any;

import numpy as np;

from .trainingConfig import ReportingConfig;


def writeTrainingReports(
    outputRoot: Path,
    modelVersion: str,
    createdAt: str,
    gitCommit: str,
    dataset: dict[str, Any],
    classIds: tuple[str, ...],
    displayNames: dict[str, str],
    metrics: dict[str, Any],
    validationConfusion: np.ndarray,
    thresholds: dict[str, dict[str, Any]],
    history: list[dict[str, float | int]],
    runtime: dict[str, Any],
    reportingConfig: ReportingConfig,
    minimumValidationSamplesPerClass: int,
    baselinePackage: Path | None,
) -> dict[str, Any]:
    report = buildTrainingReport(
        modelVersion=modelVersion,
        createdAt=createdAt,
        gitCommit=gitCommit,
        dataset=dataset,
        classIds=classIds,
        displayNames=displayNames,
        metrics=metrics,
        validationConfusion=validationConfusion,
        thresholds=thresholds,
        history=history,
        runtime=runtime,
        reportingConfig=reportingConfig,
        minimumValidationSamplesPerClass=minimumValidationSamplesPerClass,
        baselinePackage=baselinePackage,
    );
    _writeText(outputRoot / "report-data.json", json.dumps(report, ensure_ascii=False, indent=2) + "\n");
    _writeText(outputRoot / "training-report.md", _renderMarkdown(report));
    _writeText(outputRoot / "training-report.html", _renderHtml(report));
    return report;


def buildTrainingReport(
    modelVersion: str,
    createdAt: str,
    gitCommit: str,
    dataset: dict[str, Any],
    classIds: tuple[str, ...],
    displayNames: dict[str, str],
    metrics: dict[str, Any],
    validationConfusion: np.ndarray,
    thresholds: dict[str, dict[str, Any]],
    history: list[dict[str, float | int]],
    runtime: dict[str, Any],
    reportingConfig: ReportingConfig,
    minimumValidationSamplesPerClass: int,
    baselinePackage: Path | None = None,
) -> dict[str, Any]:
    validation = metrics["validation"];
    train = metrics["train"];
    weakClasses = _findWeakClasses(
        validation,
        validationConfusion,
        classIds,
        displayNames,
        reportingConfig.weakClassLimit,
        minimumValidationSamplesPerClass,
    );
    confusionPairs = _findConfusionPairs(
        validationConfusion,
        classIds,
        displayNames,
        reportingConfig.confusionPairLimit,
    );
    insufficientClassIds = [
        classId
        for classId in classIds
        if int(validation["perClass"][classId]["support"]) < minimumValidationSamplesPerClass
    ];
    criteriaBreaches = _findCriteriaBreaches(validation, reportingConfig);
    generalizationGap = float(train["macroF1"]) - float(validation["macroF1"]);
    warnings: list[dict[str, str]] = [];
    if insufficientClassIds:
        warnings.append(
            {
                "code": "insufficient_validation_samples",
                "severity": "warning",
                "message": (
                    f"검증 표본이 클래스당 {minimumValidationSamplesPerClass}개 미만인 클래스가 "
                    f"{len(insufficientClassIds)}개입니다. 현재 수치로 최종 성능을 확정할 수 없습니다."
                ),
            },
        );
    if generalizationGap > reportingConfig.maximumGeneralizationGap:
        warnings.append(
            {
                "code": "generalization_gap",
                "severity": "warning",
                "message": f"Train과 validation의 Macro F1 차이가 {generalizationGap:.3f}으로 큽니다.",
            },
        );
    fallbackThresholdCount = sum(
        threshold.get("source") == "default_insufficient_validation_samples"
        for threshold in thresholds.values()
    );
    if fallbackThresholdCount:
        warnings.append(
            {
                "code": "fallback_thresholds",
                "severity": "warning",
                "message": f"검증 표본 부족으로 기본 임계값을 사용한 클래스가 {fallbackThresholdCount}개입니다.",
            },
        );
    for breach in criteriaBreaches:
        warnings.append({"code": breach["code"], "severity": "error", "message": breach["message"]});

    if insufficientClassIds:
        status = "additional_validation_required";
    elif criteriaBreaches:
        status = "unusable";
    else:
        status = "candidate";

    baseline = _loadBaselineComparison(baselinePackage, classIds, validation) if baselinePackage else None;
    return {
        "schemaVersion": "1.0.0",
        "status": status,
        "statusDisplayName": _statusDisplayName(status),
        "modelVersion": modelVersion,
        "createdAt": createdAt,
        "gitCommit": gitCommit,
        "dataset": dataset,
        "testEvaluated": bool(metrics["testEvaluated"]),
        "summary": {
            "bestEpoch": int(metrics["bestEpoch"]),
            "completedEpochs": int(metrics["completedEpochs"]),
            "trainMacroF1": float(train["macroF1"]),
            "validationAccuracy": float(validation["accuracy"]),
            "validationMacroF1": float(validation["macroF1"]),
            "validationNoneFalseAcceptRate": float(validation["signFalseAcceptRateOnNone"]),
            "generalizationGap": generalizationGap,
            "durationSeconds": float(runtime["durationSeconds"]),
            "peakGpuMemoryBytes": int(runtime["peakGpuMemoryBytes"]),
        },
        "criteria": asdict(reportingConfig),
        "minimumValidationSamplesPerClass": minimumValidationSamplesPerClass,
        "insufficientValidationClassIds": insufficientClassIds,
        "weakClasses": weakClasses,
        "confusionPairs": confusionPairs,
        "warnings": warnings,
        "baselineComparison": baseline,
        "metrics": metrics,
        "runtime": runtime,
        "history": history,
    };


def _findWeakClasses(
    validation: dict[str, Any],
    confusionMatrix: np.ndarray,
    classIds: tuple[str, ...],
    displayNames: dict[str, str],
    limit: int,
    minimumSupport: int,
) -> list[dict[str, Any]]:
    records = [];
    for classIndex, classId in enumerate(classIds):
        classMetrics = validation["perClass"][classId];
        row = confusionMatrix[classIndex].copy();
        row[classIndex] = 0;
        confusedIndex = int(np.argmax(row));
        confusedCount = int(row[confusedIndex]);
        support = int(classMetrics["support"]);
        records.append(
            {
                "classId": classId,
                "displayName": displayNames.get(classId, classId),
                "support": support,
                "precision": float(classMetrics["precision"]),
                "recall": float(classMetrics["recall"]),
                "f1": float(classMetrics["f1"]),
                "insufficientValidationSamples": support < minimumSupport,
                "mostConfusedWithClassId": classIds[confusedIndex] if confusedCount else None,
                "mostConfusedWithDisplayName": displayNames.get(classIds[confusedIndex], classIds[confusedIndex]) if confusedCount else None,
                "mostConfusedCount": confusedCount,
                "mostConfusedRate": float(confusedCount / support) if support else 0.0,
            },
        );
    return sorted(records, key=lambda item: (item["recall"], item["f1"], item["support"], item["classId"]))[:limit];


def _findConfusionPairs(
    confusionMatrix: np.ndarray,
    classIds: tuple[str, ...],
    displayNames: dict[str, str],
    limit: int,
) -> list[dict[str, Any]]:
    pairs = [];
    for actualIndex, actualClassId in enumerate(classIds):
        support = int(confusionMatrix[actualIndex].sum());
        for predictedIndex, predictedClassId in enumerate(classIds):
            if actualIndex == predictedIndex:
                continue;
            count = int(confusionMatrix[actualIndex, predictedIndex]);
            if count == 0:
                continue;
            pairs.append(
                {
                    "actualClassId": actualClassId,
                    "actualDisplayName": displayNames.get(actualClassId, actualClassId),
                    "predictedClassId": predictedClassId,
                    "predictedDisplayName": displayNames.get(predictedClassId, predictedClassId),
                    "count": count,
                    "rate": float(count / support) if support else 0.0,
                },
            );
    return sorted(pairs, key=lambda item: (-item["count"], -item["rate"], item["actualClassId"]))[:limit];


def _findCriteriaBreaches(validation: dict[str, Any], config: ReportingConfig) -> list[dict[str, str]]:
    breaches = [];
    if float(validation["macroF1"]) < config.minimumValidationMacroF1:
        breaches.append(
            {
                "code": "low_validation_macro_f1",
                "message": (
                    f"Validation Macro F1이 {float(validation['macroF1']):.3f}으로 "
                    f"기준 {config.minimumValidationMacroF1:.3f}보다 낮습니다."
                ),
            },
        );
    lowRecallCount = sum(
        float(classMetrics["recall"]) < config.minimumClassRecall
        for classMetrics in validation["perClass"].values()
    );
    if lowRecallCount:
        breaches.append(
            {
                "code": "low_class_recall",
                "message": f"Recall이 기준 {config.minimumClassRecall:.3f}보다 낮은 클래스가 {lowRecallCount}개입니다.",
            },
        );
    noneFalseAcceptRate = float(validation["signFalseAcceptRateOnNone"]);
    if noneFalseAcceptRate > config.maximumNoneFalseAcceptRate:
        breaches.append(
            {
                "code": "high_none_false_accept_rate",
                "message": (
                    f"NONE 오수락률이 {noneFalseAcceptRate:.3f}으로 "
                    f"기준 {config.maximumNoneFalseAcceptRate:.3f}을 초과했습니다."
                ),
            },
        );
    return breaches;


def _loadBaselineComparison(
    packageRoot: Path,
    classIds: tuple[str, ...],
    currentValidation: dict[str, Any],
) -> dict[str, Any]:
    metricsPath = packageRoot / "metrics.json";
    manifestPath = packageRoot / "model-manifest.json";
    if not metricsPath.is_file() or not manifestPath.is_file():
        raise ValueError(f"Baseline package is missing metrics.json or model-manifest.json: {packageRoot}");
    metrics = json.loads(metricsPath.read_text(encoding="utf-8"));
    manifest = json.loads(manifestPath.read_text(encoding="utf-8"));
    baselineClassIds = tuple(manifest["model"]["classIds"]);
    if baselineClassIds != classIds:
        raise ValueError("Baseline package class order does not match the current model.");
    baselineValidation = metrics["validation"];
    fields = {
        "accuracy": "accuracy",
        "macroF1": "macroF1",
        "noneFalseAcceptRate": "signFalseAcceptRateOnNone",
    };
    comparisons = {};
    for outputName, metricName in fields.items():
        currentValue = float(currentValidation[metricName]);
        baselineValue = float(baselineValidation[metricName]);
        comparisons[outputName] = {
            "current": currentValue,
            "baseline": baselineValue,
            "difference": currentValue - baselineValue,
        };
    return {
        "modelVersion": manifest.get("modelVersion", "unknown"),
        "packagePath": str(packageRoot),
        "validation": comparisons,
    };


def _renderMarkdown(report: dict[str, Any]) -> str:
    summary = report["summary"];
    lines = [
        f"# 지문자 모델 학습 리포트: {report['modelVersion']}",
        "",
        f"**판정: {report['statusDisplayName']}**",
        "",
        "## 핵심 지표",
        "",
        "| 항목 | 결과 |",
        "| --- | ---: |",
        f"| Validation Accuracy | {_percent(summary['validationAccuracy'])} |",
        f"| Validation Macro F1 | {_decimal(summary['validationMacroF1'])} |",
        f"| NONE 오수락률 | {_percent(summary['validationNoneFalseAcceptRate'])} |",
        f"| Train-Validation F1 차이 | {_decimal(summary['generalizationGap'])} |",
        f"| 최고 epoch / 완료 epoch | {summary['bestEpoch']} / {summary['completedEpochs']} |",
        f"| 학습 시간 | {_duration(summary['durationSeconds'])} |",
        f"| Test 평가 | {'실행함' if report['testEvaluated'] else '실행하지 않음'} |",
        "",
        "## 확인 필요",
        "",
    ];
    if report["warnings"]:
        lines.extend(f"- {warning['message']}" for warning in report["warnings"]);
    else:
        lines.append("- 별도 경고 없음");
    lines.extend(
        [
            "",
            "## 인식이 약한 문자",
            "",
            "| 문자 | Recall | F1 | 표본 | 가장 많이 혼동 |",
            "| --- | ---: | ---: | ---: | --- |",
        ],
    );
    for item in report["weakClasses"]:
        confused = item["mostConfusedWithDisplayName"] or "-";
        if item["mostConfusedCount"]:
            confused = f"{confused} ({item['mostConfusedCount']}건)";
        support = f"{item['support']}개" + (" (부족)" if item["insufficientValidationSamples"] else "");
        lines.append(
            f"| {item['displayName']} (`{item['classId']}`) | {_percent(item['recall'])} | "
            f"{_decimal(item['f1'])} | {support} | {confused} |",
        );
    lines.extend(["", "## 주요 혼동", ""]);
    if report["confusionPairs"]:
        lines.extend(
            [
                "| 실제 | 예측 | 건수 | 실제 문자 내 비율 |",
                "| --- | --- | ---: | ---: |",
            ],
        );
        for item in report["confusionPairs"]:
            lines.append(
                f"| {item['actualDisplayName']} | {item['predictedDisplayName']} | "
                f"{item['count']} | {_percent(item['rate'])} |",
            );
    else:
        lines.append("혼동 사례가 없습니다.");
    lines.extend(["", "## 실행 정보", ""]);
    lines.extend(
        [
            f"- 생성 시각: `{report['createdAt']}`",
            f"- Git commit: `{report['gitCommit']}`",
            f"- 데이터셋 버전: `{report['dataset'].get('version')}`",
            f"- 장치: `{report['runtime'].get('deviceName')}`",
            f"- 최대 GPU 메모리: {_bytes(report['summary']['peakGpuMemoryBytes'])}",
        ],
    );
    if report["baselineComparison"]:
        comparison = report["baselineComparison"];
        lines.extend(["", "## 이전 모델 비교", "", f"기준 모델: `{comparison['modelVersion']}`", ""]);
        lines.extend(
            [
                "| 항목 | 현재 | 이전 | 변화 |",
                "| --- | ---: | ---: | ---: |",
            ],
        );
        for name, values in comparison["validation"].items():
            lines.append(
                f"| {name} | {_decimal(values['current'])} | {_decimal(values['baseline'])} | "
                f"{values['difference']:+.3f} |",
            );
    return "\n".join(lines) + "\n";


def _renderHtml(report: dict[str, Any]) -> str:
    summary = report["summary"];
    warningItems = "".join(
        f'<li class="{escape(item["severity"])}">{escape(item["message"])}</li>'
        for item in report["warnings"]
    ) or "<li>별도 경고 없음</li>";
    weakRows = "".join(
        "<tr>"
        f"<td><strong>{escape(item['displayName'])}</strong><small>{escape(item['classId'])}</small></td>"
        f"<td>{_percent(item['recall'])}</td><td>{_decimal(item['f1'])}</td>"
        f"<td>{item['support']}{' · 부족' if item['insufficientValidationSamples'] else ''}</td>"
        f"<td>{escape(item['mostConfusedWithDisplayName'] or '-')}"
        f"{' · ' + str(item['mostConfusedCount']) + '건' if item['mostConfusedCount'] else ''}</td>"
        "</tr>"
        for item in report["weakClasses"]
    );
    confusionRows = "".join(
        "<tr>"
        f"<td>{escape(item['actualDisplayName'])}</td><td>{escape(item['predictedDisplayName'])}</td>"
        f"<td>{item['count']}</td><td>{_percent(item['rate'])}</td>"
        "</tr>"
        for item in report["confusionPairs"]
    ) or '<tr><td colspan="4">혼동 사례가 없습니다.</td></tr>';
    baselineSection = _renderBaselineHtml(report["baselineComparison"]);
    statusClass = escape(report["status"]);
    return f"""<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>지문자 모델 학습 리포트 · {escape(report['modelVersion'])}</title>
  <style>
    :root {{ color-scheme: light; font-family: Inter, Pretendard, "Noto Sans KR", sans-serif; color: #202124; background: #f5f6f7; }}
    * {{ box-sizing: border-box; }}
    body {{ margin: 0; }}
    main {{ width: min(1120px, calc(100% - 32px)); margin: 32px auto 64px; }}
    header {{ background: #fff; border-top: 5px solid #202124; padding: 28px; }}
    h1 {{ margin: 8px 0 6px; font-size: 28px; letter-spacing: 0; }}
    h2 {{ margin: 0 0 16px; font-size: 19px; letter-spacing: 0; }}
    p {{ margin: 4px 0; color: #5f6368; }}
    .badge {{ display: inline-block; padding: 6px 10px; border-radius: 4px; font-weight: 700; background: #e8f0fe; color: #174ea6; }}
    .badge.additional_validation_required {{ background: #fef7e0; color: #7a4d00; }}
    .badge.unusable {{ background: #fce8e6; color: #a50e0e; }}
    .badge.candidate {{ background: #e6f4ea; color: #137333; }}
    .metrics {{ display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1px; margin-top: 24px; background: #dadce0; border: 1px solid #dadce0; }}
    .metric {{ min-height: 112px; padding: 18px; background: #fff; }}
    .metric span {{ display: block; color: #5f6368; font-size: 13px; }}
    .metric strong {{ display: block; margin-top: 12px; font-size: 25px; }}
    section {{ margin-top: 18px; padding: 24px; background: #fff; }}
    table {{ width: 100%; border-collapse: collapse; font-size: 14px; }}
    th, td {{ padding: 11px 10px; border-bottom: 1px solid #e7e8ea; text-align: left; }}
    th {{ color: #5f6368; font-size: 12px; }}
    td small {{ display: block; margin-top: 3px; color: #80868b; }}
    ul {{ margin: 0; padding-left: 20px; }}
    li {{ margin: 8px 0; }}
    li.error {{ color: #a50e0e; }}
    li.warning {{ color: #7a4d00; }}
    .meta {{ display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 24px; }}
    code {{ overflow-wrap: anywhere; }}
    @media (max-width: 760px) {{ .metrics {{ grid-template-columns: repeat(2, 1fr); }} .meta {{ grid-template-columns: 1fr; }} main {{ width: min(100% - 20px, 1120px); margin-top: 10px; }} section, header {{ padding: 18px; }} .table-wrap {{ overflow-x: auto; }} }}
  </style>
</head>
<body>
<main>
  <header>
    <span class="badge {statusClass}">{escape(report['statusDisplayName'])}</span>
    <h1>{escape(report['modelVersion'])}</h1>
    <p>지문자 단일 프레임 모델 학습 결과</p>
    <div class="metrics">
      <div class="metric"><span>Validation Accuracy</span><strong>{_percent(summary['validationAccuracy'])}</strong></div>
      <div class="metric"><span>Validation Macro F1</span><strong>{_decimal(summary['validationMacroF1'])}</strong></div>
      <div class="metric"><span>NONE 오수락률</span><strong>{_percent(summary['validationNoneFalseAcceptRate'])}</strong></div>
      <div class="metric"><span>학습 시간</span><strong>{_duration(summary['durationSeconds'])}</strong></div>
    </div>
  </header>
  <section><h2>확인 필요</h2><ul>{warningItems}</ul></section>
  <section><h2>인식이 약한 문자</h2><div class="table-wrap"><table><thead><tr><th>문자</th><th>Recall</th><th>F1</th><th>검증 표본</th><th>가장 많이 혼동</th></tr></thead><tbody>{weakRows}</tbody></table></div></section>
  <section><h2>주요 혼동</h2><div class="table-wrap"><table><thead><tr><th>실제</th><th>예측</th><th>건수</th><th>실제 문자 내 비율</th></tr></thead><tbody>{confusionRows}</tbody></table></div></section>
  {baselineSection}
  <section><h2>실행 정보</h2><div class="meta">
    <div>최고 / 완료 epoch: <strong>{summary['bestEpoch']} / {summary['completedEpochs']}</strong></div>
    <div>Test 평가: <strong>{'실행함' if report['testEvaluated'] else '실행하지 않음'}</strong></div>
    <div>데이터셋: <code>{escape(str(report['dataset'].get('version')))}</code></div>
    <div>장치: <code>{escape(str(report['runtime'].get('deviceName')))}</code></div>
    <div>최대 GPU 메모리: <strong>{_bytes(summary['peakGpuMemoryBytes'])}</strong></div>
    <div>생성 시각: <code>{escape(report['createdAt'])}</code></div>
    <div>Git commit: <code>{escape(report['gitCommit'])}</code></div>
  </div></section>
</main>
</body>
</html>
""";


def _renderBaselineHtml(comparison: dict[str, Any] | None) -> str:
    if comparison is None:
        return "";
    rows = "".join(
        "<tr>"
        f"<td>{escape(name)}</td><td>{_decimal(values['current'])}</td>"
        f"<td>{_decimal(values['baseline'])}</td><td>{values['difference']:+.3f}</td>"
        "</tr>"
        for name, values in comparison["validation"].items()
    );
    return (
        f'<section><h2>이전 모델 비교 · {escape(comparison["modelVersion"])}</h2>'
        '<div class="table-wrap"><table><thead><tr><th>항목</th><th>현재</th><th>이전</th><th>변화</th></tr></thead>'
        f"<tbody>{rows}</tbody></table></div></section>"
    );


def _statusDisplayName(status: str) -> str:
    return {
        "candidate": "후보 모델",
        "additional_validation_required": "추가 검증 필요",
        "unusable": "사용 부적합",
    }[status];


def _percent(value: float) -> str:
    return f"{float(value) * 100:.1f}%";


def _decimal(value: float) -> str:
    return f"{float(value):.3f}";


def _duration(seconds: float) -> str:
    totalSeconds = int(round(float(seconds)));
    minutes, remainingSeconds = divmod(totalSeconds, 60);
    hours, minutes = divmod(minutes, 60);
    if hours:
        return f"{hours}시간 {minutes}분 {remainingSeconds}초";
    if minutes:
        return f"{minutes}분 {remainingSeconds}초";
    return f"{remainingSeconds}초";


def _bytes(value: int) -> str:
    if value <= 0:
        return "사용 안 함";
    gibibytes = value / (1024 ** 3);
    return f"{gibibytes:.2f} GiB";


def _writeText(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8", newline="\n");
