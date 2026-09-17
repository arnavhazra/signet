import secrets

DEMO_ORG_ID = "org_signet_demo"
DEMO_COOKIE = "signet_demo"
CHECKER_NODE_ID = "checker_approval"
CHECKER_ADVANCE_ROLES = frozenset({"checker", "admin"})
DEFAULT_WORKFLOW_SLUG = "exception-review"
NAV_WORKFLOW_SLUG = "nav-signoff"
CHECKER_THRESHOLD = 100
DEMO_ORG_TTL_HOURS = 72


def new_visitor_org_id() -> str:
    return f"org_v_{secrets.token_hex(10)}"
