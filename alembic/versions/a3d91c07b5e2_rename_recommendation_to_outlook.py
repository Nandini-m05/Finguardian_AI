"""rename recommendation to outlook

Revision ID: a3d91c07b5e2
Revises: e21f84d7ff97
Create Date: 2026-10-15

"""
from typing import Sequence, Union

from alembic import op

revision: str = 'a3d91c07b5e2'
down_revision: Union[str, Sequence[str], None] = 'e21f84d7ff97'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

OLD_TO_NEW = {"buy": "positive_signals", "hold": "mixed_signals", "avoid": "negative_signals"}


def upgrade() -> None:
    op.alter_column("analyses", "recommendation", new_column_name="outlook")
    op.alter_column("analyses", "decision_rationale", new_column_name="outlook_rationale")
    for old, new in OLD_TO_NEW.items():
        op.execute(f"UPDATE analyses SET outlook = '{new}' WHERE outlook = '{old}'")


def downgrade() -> None:
    for old, new in OLD_TO_NEW.items():
        op.execute(f"UPDATE analyses SET outlook = '{old}' WHERE outlook = '{new}'")
    op.alter_column("analyses", "outlook_rationale", new_column_name="decision_rationale")
    op.alter_column("analyses", "outlook", new_column_name="recommendation")
