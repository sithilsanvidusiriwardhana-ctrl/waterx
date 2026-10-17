"""Connection and initialization helpers for the WaterX SQLite database."""

import argparse
import sqlite3
from contextlib import closing
from pathlib import Path


DATABASE_PATH = Path(__file__).resolve().with_name("waterx.db")
SCHEMA_PATH = Path(__file__).resolve().parent / "schema" / "waterx.sql"


def get_connection(db_path: str | Path = DATABASE_PATH) -> sqlite3.Connection:
    """Open a WaterX database connection with foreign-key checks enabled."""
    connection = sqlite3.connect(db_path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialize_database(db_path: str | Path = DATABASE_PATH) -> None:
    """Create the WaterX schema in the selected database if it is missing."""
    schema = SCHEMA_PATH.read_text(encoding="utf-8")
    with closing(get_connection(db_path)) as connection:
        connection.executescript(schema)


def main() -> None:
    parser = argparse.ArgumentParser(description="Initialize the WaterX SQLite database.")
    parser.add_argument(
        "--database",
        type=Path,
        default=DATABASE_PATH,
        help=f"SQLite database file (default: {DATABASE_PATH})",
    )
    args = parser.parse_args()

    initialize_database(args.database)
    print(f"WaterX database initialized at {args.database}")


if __name__ == "__main__":
    main()
