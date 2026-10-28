"""create_workflow_orchestration_tables

Revision ID: c83910ef1234
Revises: 5e8003071499
Create Date: 2026-10-28 23:08:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c83910ef1234'
down_revision: Union[str, Sequence[str], None] = '5e8003071499'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    # 1. workflows table
    if 'workflows' not in existing_tables:
        op.create_table(
            'workflows',
            sa.Column('id', sa.String(length=36), primary_key=True),
            sa.Column('owner_id', sa.String(length=128), nullable=False),
            sa.Column('conversation_id', sa.String(length=36), nullable=True),
            sa.Column('title', sa.String(length=255), nullable=False),
            sa.Column('request_prompt', sa.Text(), nullable=False),
            sa.Column('status', sa.String(length=32), nullable=False, server_default='draft'),
            sa.Column('plan_version', sa.Integer(), nullable=False, server_default='1'),
            sa.Column('plan', sa.JSON(), nullable=True),
            sa.Column('context_data', sa.JSON(), nullable=True),
            sa.Column('claimed_by_worker', sa.String(length=64), nullable=True),
            sa.Column('clarification_question', sa.Text(), nullable=True),
            sa.Column('clarification_response', sa.Text(), nullable=True),
            sa.Column('pending_confirmation', sa.JSON(), nullable=True),
            sa.Column('result_summary', sa.Text(), nullable=True),
            sa.Column('final_report', sa.JSON(), nullable=True),
            sa.Column('error_message', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index('ix_workflows_owner_id', 'workflows', ['owner_id'])
        op.create_index('ix_workflows_conversation_id', 'workflows', ['conversation_id'])
        op.create_index('ix_workflows_status', 'workflows', ['status'])
        op.create_index('ix_workflows_claimed_by_worker', 'workflows', ['claimed_by_worker'])

    # 2. workflow_steps table
    if 'workflow_steps' not in existing_tables:
        op.create_table(
            'workflow_steps',
            sa.Column('id', sa.String(length=36), primary_key=True),
            sa.Column('workflow_id', sa.String(length=36), sa.ForeignKey('workflows.id', ondelete='CASCADE'), nullable=False),
            sa.Column('step_number', sa.Integer(), nullable=False),
            sa.Column('title', sa.String(length=255), nullable=False),
            sa.Column('capability', sa.String(length=64), nullable=False),
            sa.Column('parameters', sa.JSON(), nullable=True),
            sa.Column('depends_on', sa.JSON(), nullable=True),
            sa.Column('is_consequential', sa.Boolean(), nullable=False, server_default='0'),
            sa.Column('consequential_reason', sa.String(length=255), nullable=True),
            sa.Column('requires_confirmation', sa.Boolean(), nullable=False, server_default='0'),
            sa.Column('confirmed_by_user', sa.Boolean(), nullable=True),
            sa.Column('status', sa.String(length=32), nullable=False, server_default='pending'),
            sa.Column('retry_count', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('max_retries', sa.Integer(), nullable=False, server_default='2'),
            sa.Column('output_data', sa.JSON(), nullable=True),
            sa.Column('citations', sa.JSON(), nullable=True),
            sa.Column('is_simulated', sa.Boolean(), nullable=False, server_default='0'),
            sa.Column('error_message', sa.Text(), nullable=True),
            sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index('ix_workflow_steps_workflow_id', 'workflow_steps', ['workflow_id'])
        op.create_index('ix_workflow_steps_status', 'workflow_steps', ['status'])

    # 3. workflow_events table
    if 'workflow_events' not in existing_tables:
        op.create_table(
            'workflow_events',
            sa.Column('id', sa.String(length=36), primary_key=True),
            sa.Column('workflow_id', sa.String(length=36), sa.ForeignKey('workflows.id', ondelete='CASCADE'), nullable=False),
            sa.Column('step_id', sa.String(length=36), nullable=True),
            sa.Column('event_type', sa.String(length=64), nullable=False),
            sa.Column('message', sa.Text(), nullable=False),
            sa.Column('payload', sa.JSON(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index('ix_workflow_events_workflow_id', 'workflow_events', ['workflow_id'])
        op.create_index('ix_workflow_events_event_type', 'workflow_events', ['event_type'])


def downgrade() -> None:
    op.drop_table('workflow_events')
    op.drop_table('workflow_steps')
    op.drop_table('workflows')
