from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
BATCH_DIR = ROOT / "data" / "tmp_v2_parse" / "research_batches_v2"
MANIFEST_PATH = BATCH_DIR / "manifest.json"
TRACKER_PATH = BATCH_DIR / "tracker.json"


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def load_manifest() -> dict:
    if not MANIFEST_PATH.exists():
        raise SystemExit(f"FAIL: missing manifest: {MANIFEST_PATH}")
    return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))


def load_tracker() -> dict:
    manifest = load_manifest()
    if TRACKER_PATH.exists():
        return json.loads(TRACKER_PATH.read_text(encoding="utf-8"))
    tracker = {
        "created_at": utc_now(),
        "updated_at": utc_now(),
        "batches": [],
    }
    for batch in manifest["batches"]:
        tracker["batches"].append(
            {
                "batch_id": batch["batch_id"],
                "year": batch["year"],
                "paper": batch["paper"],
                "wine_count": batch["wine_count"],
                "path": batch["path"],
                "status": "pending",
                "worker": None,
                "claimed_at": None,
                "completed_at": None,
                "failed_at": None,
                "notes": None,
            }
        )
    save_tracker(tracker)
    return tracker


def save_tracker(tracker: dict) -> None:
    tracker["updated_at"] = utc_now()
    TRACKER_PATH.write_text(json.dumps(tracker, indent=2, ensure_ascii=False), encoding="utf-8")


def get_batch_payload(batch_id: str) -> dict:
    batch_path = BATCH_DIR / f"{batch_id}.json"
    if not batch_path.exists():
        raise SystemExit(f"FAIL: missing batch file: {batch_path}")
    return json.loads(batch_path.read_text(encoding="utf-8"))


def find_tracker_row(tracker: dict, batch_id: str) -> dict:
    for row in tracker["batches"]:
        if row["batch_id"] == batch_id:
            return row
    raise SystemExit(f"FAIL: unknown batch_id: {batch_id}")


def cmd_init(_: argparse.Namespace) -> None:
    tracker = load_tracker()
    print(f"OK: tracker ready at {TRACKER_PATH}")
    print(f"OK: batches tracked = {len(tracker['batches'])}")


def cmd_status(_: argparse.Namespace) -> None:
    tracker = load_tracker()
    counts: dict[str, int] = {}
    for row in tracker["batches"]:
        counts[row["status"]] = counts.get(row["status"], 0) + 1
    print(f"Tracker: {TRACKER_PATH}")
    for status in ["pending", "claimed", "done", "failed"]:
        print(f"{status}: {counts.get(status, 0)}")


def cmd_list(args: argparse.Namespace) -> None:
    tracker = load_tracker()
    rows = tracker["batches"]
    if args.status:
        rows = [row for row in rows if row["status"] == args.status]
    for row in rows:
        print(
            f"{row['batch_id']}: status={row['status']}, worker={row['worker']}, "
            f"claimed_at={row['claimed_at']}, completed_at={row['completed_at']}, failed_at={row['failed_at']}"
        )


def cmd_claim(args: argparse.Namespace) -> None:
    tracker = load_tracker()
    pending = [row for row in tracker["batches"] if row["status"] == "pending"]
    if not pending:
        print("NO_PENDING_BATCHES")
        return
    pending.sort(key=lambda row: (row["year"], row["paper"]))
    row = pending[0]
    row["status"] = "claimed"
    row["worker"] = args.worker
    row["claimed_at"] = utc_now()
    row["notes"] = args.notes
    save_tracker(tracker)
    payload = get_batch_payload(row["batch_id"])
    print(f"CLAIMED {row['batch_id']} for worker={args.worker}")
    if args.show_commands:
        for command in payload["commands"]:
            print(command)


def cmd_show(args: argparse.Namespace) -> None:
    tracker = load_tracker()
    row = find_tracker_row(tracker, args.batch_id)
    payload = get_batch_payload(args.batch_id)
    print(json.dumps({"tracker": row, "batch": payload}, indent=2, ensure_ascii=False))


def cmd_commands(args: argparse.Namespace) -> None:
    payload = get_batch_payload(args.batch_id)
    for command in payload["commands"]:
        print(command)


def cmd_complete(args: argparse.Namespace) -> None:
    tracker = load_tracker()
    row = find_tracker_row(tracker, args.batch_id)
    row["status"] = "done"
    row["worker"] = args.worker or row["worker"]
    row["completed_at"] = utc_now()
    row["notes"] = args.notes
    save_tracker(tracker)
    print(f"DONE {args.batch_id}")


def cmd_fail(args: argparse.Namespace) -> None:
    tracker = load_tracker()
    row = find_tracker_row(tracker, args.batch_id)
    row["status"] = "failed"
    row["worker"] = args.worker or row["worker"]
    row["failed_at"] = utc_now()
    row["notes"] = args.notes
    save_tracker(tracker)
    print(f"FAILED {args.batch_id}")


def cmd_reset(args: argparse.Namespace) -> None:
    tracker = load_tracker()
    row = find_tracker_row(tracker, args.batch_id)
    row["status"] = "pending"
    row["worker"] = None
    row["claimed_at"] = None
    row["completed_at"] = None
    row["failed_at"] = None
    row["notes"] = None
    save_tracker(tracker)
    print(f"RESET {args.batch_id}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Manage V2 wine-research batches.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    init_p = subparsers.add_parser("init")
    init_p.set_defaults(func=cmd_init)

    status_p = subparsers.add_parser("status")
    status_p.set_defaults(func=cmd_status)

    list_p = subparsers.add_parser("list")
    list_p.add_argument("--status", choices=["pending", "claimed", "done", "failed"])
    list_p.set_defaults(func=cmd_list)

    claim_p = subparsers.add_parser("claim-next")
    claim_p.add_argument("--worker", required=True)
    claim_p.add_argument("--notes")
    claim_p.add_argument("--show-commands", action="store_true")
    claim_p.set_defaults(func=cmd_claim)

    show_p = subparsers.add_parser("show")
    show_p.add_argument("batch_id")
    show_p.set_defaults(func=cmd_show)

    commands_p = subparsers.add_parser("commands")
    commands_p.add_argument("batch_id")
    commands_p.set_defaults(func=cmd_commands)

    complete_p = subparsers.add_parser("complete")
    complete_p.add_argument("batch_id")
    complete_p.add_argument("--worker")
    complete_p.add_argument("--notes")
    complete_p.set_defaults(func=cmd_complete)

    fail_p = subparsers.add_parser("fail")
    fail_p.add_argument("batch_id")
    fail_p.add_argument("--worker")
    fail_p.add_argument("--notes")
    fail_p.set_defaults(func=cmd_fail)

    reset_p = subparsers.add_parser("reset")
    reset_p.add_argument("batch_id")
    reset_p.set_defaults(func=cmd_reset)

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
