"""add_72h_data_retention_expires_at

Revision ID: d72026103100
Revises: c83910ef1234
Create Date: 2026-10-31 00:10:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd72026103100'
down_revision: Union[str, Sequence[str], None] = 'c83910ef1234'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    tables_to_update = [
        'conversations',
        'files',
        'wifi_sensing_events',
        'browser_tasks',
        'research_jobs',
        'workflows',
    ]

    for tbl in tables_to_update:
        if tbl in inspector.get_table_names():
            columns = [c['name'] for c in inspector.get_columns(tbl)]
            if 'expires_at' not in columns:
                op.add_column(
                    tbl,
                    sa.Column(
                        'expires_at',
                        sa.DateTime(timezone=True),
                        nullable=True,
                        comment='Automatic 72-hour inactivity data deletion timestamp',
                    ),
                )
                op.create_index(f'ix_{tbl}_expires_at', tbl, ['expires_at'])


def downgrade() -> None:
    tables_to_update = [
        'conversations',
        'files',
        'wifi_sensing_events',
        'browser_tasks',
        'research_jobs',
        'workflows',
    ]

    for tbl in tables_to_update:
        try:
            op.drop_index(f'ix_{tbl}_expires_at', table_name=tbl)
            op.drop_column(tbl, 'expires_at')
        except Exception:
            pass
