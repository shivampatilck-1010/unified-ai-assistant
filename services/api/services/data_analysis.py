import csv
import io
import json
import logging
import math
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

logger = logging.getLogger("services.data_analysis")


class ColumnStats(BaseModel):
    name: str
    data_type: str  # numeric | categorical | datetime
    count: int
    missing_count: int
    mean: Optional[float] = None
    median: Optional[float] = None
    std_dev: Optional[float] = None
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    unique_count: Optional[int] = None
    top_values: Optional[List[Dict[str, Any]]] = None


class DatasetAnalysisResult(BaseModel):
    row_count: int
    column_count: int
    columns: List[str]
    column_statistics: List[ColumnStats]
    correlations: Dict[str, Dict[str, float]] = Field(default_factory=dict)
    insights_markdown: str


class DataAnalysisEngine:
    """Performs real mathematical calculations, statistical profiling, and analytical reporting on datasets."""

    @classmethod
    def analyze_csv_text(cls, csv_text: str) -> DatasetAnalysisResult:
        """Parses CSV text and computes authentic statistical metrics without LLM hallucination."""
        reader = csv.DictReader(io.StringIO(csv_text.strip()))
        rows = list(reader)
        if not rows:
            return DatasetAnalysisResult(
                row_count=0,
                column_count=0,
                columns=[],
                column_statistics=[],
                insights_markdown="Dataset is empty.",
            )

        headers = list(rows[0].keys())
        stats_list: List[ColumnStats] = []
        numeric_data: Dict[str, List[float]] = {}

        for col in headers:
            values = [r[col] for r in rows if r.get(col) is not None]
            clean_vals = [v.strip() for v in values if v.strip() != ""]
            missing = len(rows) - len(clean_vals)

            # Determine if column is numeric
            is_numeric = False
            num_vals: List[float] = []
            try:
                num_vals = [float(v.replace(",", "")) for v in clean_vals]
                is_numeric = len(num_vals) > 0 and (len(num_vals) / len(clean_vals) >= 0.8)
            except Exception:
                is_numeric = False

            if is_numeric and num_vals:
                numeric_data[col] = num_vals
                num_vals.sort()
                n = len(num_vals)
                avg = sum(num_vals) / n
                med = num_vals[n // 2] if n % 2 != 0 else (num_vals[n // 2 - 1] + num_vals[n // 2]) / 2.0
                variance = sum((x - avg) ** 2 for x in num_vals) / max(n - 1, 1)
                std = math.sqrt(variance)

                stats_list.append(ColumnStats(
                    name=col,
                    data_type="numeric",
                    count=n,
                    missing_count=missing,
                    mean=round(avg, 2),
                    median=round(med, 2),
                    std_dev=round(std, 2),
                    min_value=round(num_vals[0], 2),
                    max_value=round(num_vals[-1], 2),
                ))
            else:
                # Categorical summary
                from collections import Counter
                counts = Counter(clean_vals)
                top = [{"value": val, "count": cnt} for val, cnt in counts.most_common(5)]
                stats_list.append(ColumnStats(
                    name=col,
                    data_type="categorical",
                    count=len(clean_vals),
                    missing_count=missing,
                    unique_count=len(counts),
                    top_values=top,
                ))

        # Compute Pearson correlation matrix across numeric columns
        corr_matrix: Dict[str, Dict[str, float]] = {}
        num_cols = list(numeric_data.keys())
        for c1 in num_cols:
            corr_matrix[c1] = {}
            for c2 in num_cols:
                if c1 == c2:
                    corr_matrix[c1][c2] = 1.0
                else:
                    v1, v2 = numeric_data[c1], numeric_data[c2]
                    min_len = min(len(v1), len(v2))
                    if min_len >= 3:
                        sub_v1 = v1[:min_len]
                        sub_v2 = v2[:min_len]
                        m1, m2 = sum(sub_v1) / min_len, sum(sub_v2) / min_len
                        cov = sum((a - m1) * (b - m2) for a, b in zip(sub_v1, sub_v2))
                        var1 = sum((a - m1) ** 2 for a in sub_v1)
                        var2 = sum((b - m2) ** 2 for b in sub_v2)
                        denom = math.sqrt(var1 * var2)
                        corr_val = round(cov / denom, 2) if denom != 0 else 0.0
                        corr_matrix[c1][c2] = corr_val

        # Generate markdown report
        lines = [
            f"## 📊 Statistical Dataset Profile",
            f"- **Records Analyzed:** {len(rows)}",
            f"- **Columns Profiled:** {len(headers)} ({len(num_cols)} numerical, {len(headers) - len(num_cols)} categorical)\n",
            "### Column Distributions & Key Indicators",
            "| Column | Type | Mean | Median | Std Dev | Min | Max | Missing |",
            "|---|---|---|---|---|---|---|---|",
        ]
        for s in stats_list:
            if s.data_type == "numeric":
                lines.append(f"| **{s.name}** | Numerical | {s.mean} | {s.median} | {s.std_dev} | {s.min_value} | {s.max_value} | {s.missing_count} |")
            else:
                top_str = f"{s.unique_count} unique"
                lines.append(f"| **{s.name}** | Categorical | — | — | — | — | — | {s.missing_count} ({top_str}) |")

        if corr_matrix and len(num_cols) > 1:
            lines.append("\n### 🔗 Key Correlations")
            for c1 in num_cols[:3]:
                for c2, r in corr_matrix[c1].items():
                    if c1 < c2 and abs(r) >= 0.4:
                        relation = "positive" if r > 0 else "negative"
                        strength = "strong" if abs(r) >= 0.7 else "moderate"
                        lines.append(f"- **{c1}** & **{c2}**: `r = {r}` ({strength} {relation} correlation)")

        return DatasetAnalysisResult(
            row_count=len(rows),
            column_count=len(headers),
            columns=headers,
            column_statistics=stats_list,
            correlations=corr_matrix,
            insights_markdown="\n".join(lines),
        )
