import calendar
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

MAX_RECURRENCE_OCCURRENCES = 50
MAX_RECURRENCE_HORIZON_DAYS = 366
VALID_WEEKDAYS = {"MO": 0, "TU": 1, "WE": 2, "TH": 3, "FR": 4, "SA": 5, "SU": 6}


def validate_timezone(tz_name: Optional[str]) -> str:
    """Validate that the timezone string is recognized by IANA zoneinfo."""
    if not tz_name or not tz_name.strip():
        return "UTC"
    tz_clean = tz_name.strip()
    if tz_clean.upper() in {"UTC", "GMT", "Z"}:
        return "UTC"
    try:
        ZoneInfo(tz_clean)
        return tz_clean
    except (ZoneInfoNotFoundError, ValueError) as exc:
        raise ValueError(f"Invalid timezone: '{tz_clean}'. Must be a valid IANA timezone name.") from exc


def ensure_utc(dt: datetime, tz_name: Optional[str] = None) -> datetime:
    """Ensure datetime is timezone-aware and converted to UTC."""
    if dt.tzinfo is None:
        tz_str = validate_timezone(tz_name) if tz_name else "UTC"
        if tz_str == "UTC":
            dt = dt.replace(tzinfo=timezone.utc)
        else:
            try:
                dt = dt.replace(tzinfo=ZoneInfo(tz_str))
            except Exception:
                dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def parse_rrule(rrule_str: str) -> Dict[str, Any]:
    """
    Parse and validate a bounded subset of iCalendar RRULE:
    Supported: FREQ=(DAILY|WEEKLY|MONTHLY), INTERVAL (int >= 1), COUNT (int 1..50),
    UNTIL (YYYYMMDD or YYYYMMDDTHHMMSSZ or ISO), BYDAY (comma-separated MO..SU).
    """
    if not rrule_str or not rrule_str.strip():
        raise ValueError("Recurrence rule cannot be empty.")

    cleaned = rrule_str.strip()
    if cleaned.upper().startswith("RRULE:"):
        cleaned = cleaned[6:].strip()

    parts = cleaned.split(";")
    rule_dict: Dict[str, Any] = {}
    for part in parts:
        if not part.strip():
            continue
        if "=" not in part:
            raise ValueError(f"Invalid RRULE segment: '{part}'")
        key, val = part.split("=", 1)
        key = key.strip().upper()
        val = val.strip()
        rule_dict[key] = val

    freq = rule_dict.get("FREQ")
    if not freq or freq not in {"DAILY", "WEEKLY", "MONTHLY"}:
        raise ValueError(f"Unsupported or missing FREQ in RRULE: '{freq}'. Supported: DAILY, WEEKLY, MONTHLY.")

    interval = 1
    if "INTERVAL" in rule_dict:
        try:
            interval = int(rule_dict["INTERVAL"])
        except (ValueError, TypeError) as exc:
            raise ValueError(f"Invalid INTERVAL: {rule_dict['INTERVAL']}") from exc
        if interval < 1:
            raise ValueError("INTERVAL must be a positive integer >= 1.")
    rule_dict["INTERVAL"] = interval

    count: Optional[int] = None
    if "COUNT" in rule_dict:
        try:
            count = int(rule_dict["COUNT"])
        except (ValueError, TypeError) as exc:
            raise ValueError(f"Invalid COUNT: {rule_dict['COUNT']}") from exc
        if count < 1 or count > MAX_RECURRENCE_OCCURRENCES:
            raise ValueError(f"COUNT must be between 1 and {MAX_RECURRENCE_OCCURRENCES}.")
    rule_dict["COUNT"] = count

    until: Optional[datetime] = None
    if "UNTIL" in rule_dict:
        raw_until = rule_dict["UNTIL"].rstrip("Z")
        try:
            if "T" in raw_until:
                if "-" in raw_until:
                    until = datetime.fromisoformat(rule_dict["UNTIL"])
                else:
                    until = datetime.strptime(raw_until, "%Y%m%dT%H%M%S").replace(tzinfo=timezone.utc)
            else:
                if "-" in raw_until:
                    until = datetime.strptime(raw_until, "%Y-%m-%d").replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)
                else:
                    until = datetime.strptime(raw_until, "%Y%m%d").replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)
            if until.tzinfo is None:
                until = until.replace(tzinfo=timezone.utc)
            else:
                until = until.astimezone(timezone.utc)
        except Exception as exc:
            raise ValueError(f"Invalid UNTIL format in RRULE: '{rule_dict['UNTIL']}'") from exc
    rule_dict["UNTIL_DT"] = until

    byday: Optional[List[str]] = None
    if "BYDAY" in rule_dict:
        raw_days = [d.strip().upper() for d in rule_dict["BYDAY"].split(",")]
        for d in raw_days:
            if d not in VALID_WEEKDAYS:
                raise ValueError(f"Unsupported BYDAY value: '{d}'. Must be one of {list(VALID_WEEKDAYS.keys())}")
        byday = raw_days
    rule_dict["BYDAY_LIST"] = byday

    return rule_dict


def _add_months(source_date: datetime, months: int) -> datetime:
    """Safely advance a datetime by a number of months, pinning to month-end if needed."""
    month = source_date.month - 1 + months
    year = source_date.year + month // 12
    month = month % 12 + 1
    day = min(source_date.day, calendar.monthrange(year, month)[1])
    return source_date.replace(year=year, month=month, day=day)


def expand_recurrence(
    start_time: datetime,
    end_time: datetime,
    rrule_str: str,
    window_start: datetime,
    window_end: datetime,
    max_occurrences: int = MAX_RECURRENCE_OCCURRENCES,
) -> List[Tuple[datetime, datetime]]:
    """
    Expand a bounded RRULE into concrete (start, end) occurrence intervals
    that overlap with [window_start, window_end].
    """
    parsed = parse_rrule(rrule_str)
    freq = parsed["FREQ"]
    interval = parsed["INTERVAL"]
    count_limit = min(parsed["COUNT"] or max_occurrences, max_occurrences)
    until_dt = parsed.get("UNTIL_DT")
    byday = parsed.get("BYDAY_LIST")

    s_utc = ensure_utc(start_time)
    e_utc = ensure_utc(end_time)
    duration = e_utc - s_utc
    w_start_utc = ensure_utc(window_start)
    w_end_utc = ensure_utc(window_end)

    horizon_cutoff = s_utc + timedelta(days=MAX_RECURRENCE_HORIZON_DAYS)
    if until_dt:
        horizon_cutoff = min(horizon_cutoff, until_dt)

    occurrences: List[Tuple[datetime, datetime]] = []
    generated_count = 0

    if freq == "DAILY":
        current_s = s_utc
        while generated_count < count_limit and current_s <= horizon_cutoff:
            current_e = current_s + duration
            if current_s <= w_end_utc and current_e >= w_start_utc:
                occurrences.append((current_s, current_e))
            generated_count += 1
            current_s = current_s + timedelta(days=interval)

    elif freq == "WEEKLY":
        if not byday:
            current_s = s_utc
            while generated_count < count_limit and current_s <= horizon_cutoff:
                current_e = current_s + duration
                if current_s <= w_end_utc and current_e >= w_start_utc:
                    occurrences.append((current_s, current_e))
                generated_count += 1
                current_s = current_s + timedelta(weeks=interval)
        else:
            target_weekdays = sorted([VALID_WEEKDAYS[d] for d in byday])
            base_date = s_utc.date()
            curr_date = base_date
            weeks_advanced = 0
            while generated_count < count_limit:
                week_start = curr_date - timedelta(days=curr_date.weekday())
                for wd in target_weekdays:
                    cand_date = week_start + timedelta(days=wd)
                    if cand_date < base_date:
                        continue
                    cand_start = s_utc.replace(
                        year=cand_date.year,
                        month=cand_date.month,
                        day=cand_date.day,
                    )
                    if cand_start > horizon_cutoff or generated_count >= count_limit:
                        break
                    cand_end = cand_start + duration
                    if cand_start <= w_end_utc and cand_end >= w_start_utc:
                        occurrences.append((cand_start, cand_end))
                    generated_count += 1

                weeks_advanced += interval
                curr_date = base_date + timedelta(weeks=weeks_advanced)
                cand_next_week = s_utc.replace(year=curr_date.year, month=curr_date.month, day=curr_date.day)
                if cand_next_week > horizon_cutoff or cand_next_week > w_end_utc:
                    break

    elif freq == "MONTHLY":
        current_s = s_utc
        month_step = 0
        while generated_count < count_limit:
            current_s = _add_months(s_utc, month_step * interval)
            if current_s > horizon_cutoff:
                break
            current_e = current_s + duration
            if current_s <= w_end_utc and current_e >= w_start_utc:
                occurrences.append((current_s, current_e))
            generated_count += 1
            month_step += 1

    return occurrences
