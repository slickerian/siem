# database.py - Database connection management and utilities
import sqlite3
import logging
from contextlib import contextmanager

logger = logging.getLogger(__name__)

class DatabaseManager:
    def __init__(self, db_file="siem.db"):
        self.db_file = db_file
        self._init_db()

    def _init_db(self):
        """Initialize database with required tables and indexes"""
        with self.get_connection() as conn:
            cur = conn.cursor()

            # Set PRAGMA settings first (before any transactions)
            cur.execute("PRAGMA journal_mode=WAL")
            cur.execute("PRAGMA foreign_keys=ON")
            cur.execute("PRAGMA synchronous=NORMAL")

            # Create logs table with indexes
            cur.execute("""
                CREATE TABLE IF NOT EXISTS logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    node_id TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    data TEXT NOT NULL
                )
            """)

            # Create nodes table for settings
            cur.execute("""
                CREATE TABLE IF NOT EXISTS nodes (
                    node_id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    enable_log_collection BOOLEAN NOT NULL DEFAULT 1,
                    log_send_interval INTEGER NOT NULL DEFAULT 30,
                    updated_at TEXT NOT NULL
                )
            """)

            # Create log_severities table for configurable event type severities
            cur.execute("""
                CREATE TABLE IF NOT EXISTS log_severities (
                    severity TEXT PRIMARY KEY,
                    event_types TEXT NOT NULL
                )
            """)

            # Insert default severities if not exists
            cur.execute("""
                INSERT OR IGNORE INTO log_severities (severity, event_types)
                VALUES
                    ('critical', 'ERROR,CRITICAL,FAIL,ACTION_FAILED'),
                    ('warning', 'WARN,WARNING'),
                    ('info', 'INFO,AUTH,SUCCESS')
            """)

            # Create indexes for performance
            cur.execute("CREATE INDEX IF NOT EXISTS idx_node_id ON logs(node_id)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_created_at ON logs(created_at)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_event_type ON logs(event_type)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_node_created ON logs(node_id, created_at)")

            conn.commit()
            logger.info("Database initialized with indexes and WAL mode")

    @contextmanager
    def get_connection(self):
        """Context manager for database connections"""
        conn = sqlite3.connect(self.db_file, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
        finally:
            conn.close()

    def execute_query(self, query, params=None, fetch=True):
        """Execute a query with automatic connection management"""
        with self.get_connection() as conn:
            cur = conn.cursor()
            cur.execute(query, params or [])
            if fetch:
                return cur.fetchall()
            else:
                conn.commit()
                return cur.lastrowid

# Global database manager instance
db_manager = DatabaseManager()