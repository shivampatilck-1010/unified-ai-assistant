import logging
import uuid
from typing import Any, Dict, List, Optional

from .base import BaseConnector, ConnectedServiceAccount, ConnectorType, PermissionScope

logger = logging.getLogger("connectors.registry")


class ConnectorRegistry:
    """Manages authorized external connector accounts, permissions, and revocations."""

    _accounts: Dict[str, ConnectedServiceAccount] = {}

    @classmethod
    def register_account(
        cls,
        owner_id: str,
        connector_type: ConnectorType,
        service_name: str,
        scopes: List[PermissionScope],
        masked_identifier: str = "••••••••",
    ) -> ConnectedServiceAccount:
        acc_id = str(uuid.uuid4())
        account = ConnectedServiceAccount(
            id=acc_id,
            owner_id=owner_id,
            connector_type=connector_type,
            service_name=service_name,
            scopes=scopes,
            is_active=True,
            credential_masked=masked_identifier,
        )
        cls._accounts[acc_id] = account
        logger.info("Connected account %s for user %s (%s)", service_name, owner_id, acc_id)
        return account

    @classmethod
    def get_user_accounts(cls, owner_id: str) -> List[ConnectedServiceAccount]:
        return [acc for acc in cls._accounts.values() if acc.owner_id == owner_id and acc.is_active]

    @classmethod
    def revoke_account(cls, account_id: str, owner_id: str) -> bool:
        acc = cls._accounts.get(account_id)
        if acc and acc.owner_id == owner_id:
            acc.is_active = False
            logger.info("Revoked connector account %s for user %s", account_id, owner_id)
            return True
        return False
