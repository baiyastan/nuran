"""
Planning constants.
"""
PLAN_PERIOD_MODIFY_BLOCKED_STATUSES = {"submitted", "approved", "locked", "closed"}

PLAN_PERIOD_NOT_EDITABLE_MSG = (
    "Cannot create/update plan items after plan has been accepted by admin"
)

